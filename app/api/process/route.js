
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  writeFile,
  rm,
  access,
  stat,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  randomUUID,
  createHash,
  createHmac,
} from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export const runtime = "nodejs";
export const maxDuration = 300;

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function runFFmpeg(input, image, output) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel", "warning",
      "-filter_threads", "1",
      "-filter_complex_threads", "1",
      "-i", input,
      "-loop", "1",
      "-i", image,
      "-filter_complex",
      "[1:v]format=rgba,scale=iw*0.20:-1[wm];[0:v][wm]overlay=W-w-24:H-h-24:format=auto[v]",
      "-map", "[v]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-threads", "2",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      output,
    ];

    const proc = spawn(
      process.env.FFMPEG_PATH || "ffmpeg",
      args
    );

    let errorText = "";

    proc.stderr.on("data", (data) => {
      errorText += data.toString();
      if (errorText.length > 15000) {
        errorText = errorText.slice(-15000);
      }
    });

    proc.on("error", (error) => {
      reject(new Error(`Unable to start FFmpeg: ${error.message}`));
    });

    proc.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg failed. Exit code: ${code}, Signal: ${signal}\n${errorText.slice(-5000)}`
          )
        );
      }
    });
  });
}

export async function POST(request) {
  let tempDir;
  let lockClaimed = false;
  let lockKey;
  const uploadedKeys = [];

  try {
    const requiredVariables = [
      "STRIPE_SECRET_KEY",
      "R2_ENDPOINT",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
    ];

    for (const variable of requiredVariables) {
      if (!process.env[variable]) {
        return NextResponse.json(
          { error: `Missing server variable: ${variable}` },
          { status: 500 }
        );
      }
    }

    const form = await request.formData();
    const sessionId = form.get("session_id");

    if (
      typeof sessionId !== "string" ||
      !/^cs_(test|live)_/.test(sessionId)
    ) {
      return NextResponse.json(
        { error: "A valid Stripe Checkout session is required." },
        { status: 400 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (
      session.payment_status !== "paid" ||
      session.amount_total !== 1000 ||
      session.currency !== "usd"
    ) {
      return NextResponse.json(
        { error: "Payment not verified." },
        { status: 402 }
      );
    }

    const files = form.getAll("videos").filter(
      (file) =>
        file &&
        typeof file.arrayBuffer === "function" &&
        file.size > 0
    );

    if (files.length < 1 || files.length > 3) {
      return NextResponse.json(
        { error: "Choose between 1 and 3 videos." },
        { status: 400 }
      );
    }

    for (const file of files) {
      if (
        !file.type.startsWith("video/") ||
        file.size > 250 * 1024 * 1024
      ) {
        return NextResponse.json(
          { error: "Each file must be a video smaller than 250 MB." },
          { status: 400 }
        );
      }
    }

    // Create a unique payment lock key without exposing the Stripe ID.
    const sessionHash = createHash("sha256")
      .update(sessionId)
      .digest("hex");

    lockKey = `payment-locks/${sessionHash}.json`;

    // Atomic create-once lock: only one request can claim this payment.
    try {
      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: lockKey,
          Body: JSON.stringify({
            sessionId,
            status: "processing",
            createdAt: new Date().toISOString(),
          }),
          ContentType: "application/json",
          IfNoneMatch: "*",
        })
      );

      lockClaimed = true;
    } catch (error) {
      if (
        error.name === "PreconditionFailed" ||
        error.$metadata?.httpStatusCode === 412
      ) {
        return NextResponse.json(
          {
            error: "This payment has already been used.",
          },
          { status: 409 }
        );
      }

      throw error;
    }

    const imagePath = path.join(
      process.cwd(),
      "public",
      "cat-image.png"
    );

    await access(imagePath);

    tempDir = await mkdtemp(
      path.join(os.tmpdir(), "flashframe-")
    );

    const results = [];

    for (const file of files) {
      const id = randomUUID();
      const inputPath = path.join(tempDir, `${id}-input`);
      const outputPath = path.join(tempDir, `${id}.mp4`);
      const objectKey = `processed/${id}.mp4`;

      await writeFile(
        inputPath,
        Buffer.from(await file.arrayBuffer())
      );

      await runFFmpeg(inputPath, imagePath, outputPath);

      const outputInfo = await stat(outputPath);

      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: objectKey,
          Body: createReadStream(outputPath),
          ContentLength: outputInfo.size,
          ContentType: "video/mp4",
        })
      );

      uploadedKeys.push(objectKey);

     const expires = Math.floor(Date.now() / 1000) + 3600;

const signature = createHmac(
  "sha256",
  process.env.DOWNLOAD_SECRET
)
  .update(`${id}.mp4:${expires}`)
  .digest("hex");

results.push({
  url: `/api/download/${id}.mp4?expires=${expires}&signature=${signature}`,
});
    }

    // Keep the lock permanently after successful processing.
    return NextResponse.json({
      success: true,
      files: results,
    });

  } catch (error) {
    console.error("FlashFrame processing error:", error);

    // Remove uploaded videos if the job failed.
    for (const key of uploadedKeys) {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
        })
      ).catch(() => {});
    }

    // Release the payment lock so a failed job can be retried.
    if (lockClaimed && lockKey) {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: lockKey,
        })
      ).catch(() => {});
    }

    return NextResponse.json(
      {
        error: error.message || "Video processing failed.",
      },
      { status: 500 }
    );

  } finally {
    if (tempDir) {
      await rm(tempDir, {
        recursive: true,
        force: true,
      }).catch(() => {});
    }
  }
}
