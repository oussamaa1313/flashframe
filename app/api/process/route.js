
import Stripe from "stripe";
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

function runFFmpeg(input, image, output) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",

      "-i", input,
      "-loop", "1",
      "-i", image,

      "-filter_complex",

      "[1:v][0:v]scale=w=rw:h=rh[cat];[0:v][cat]overlay=0:0:enable='lt(mod(t,2),0.03)':format=auto[v]",

      "-map", "[v]",
      "-map", "0:a?",

      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",

      "-c:a", "aac",
      "-b:a", "128k",

      "-shortest",
      "-movflags", "+faststart",

      output,
    ];

    const proc = spawn("/usr/local/bin/ffmpeg", args);

    let errorText = "";

    proc.stderr.on("data", (data) => {
      errorText += data.toString();

      if (errorText.length > 12000) {
        errorText = errorText.slice(-12000);
      }
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            errorText.slice(-2000) ||
            `FFmpeg exited with code ${code}`
          )
        );
      }
    });
  });
}

export async function POST(request) {
  let tempDir;

  try {
    // Check Stripe secret key
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Stripe secret key is missing");
    }

    // Read form data
    const form = await request.formData();

    const sessionId = form.get("session_id");

    // Validate Stripe session
    if (
      typeof sessionId !== "string" ||
      (
        !sessionId.startsWith("cs_test_") &&
        !sessionId.startsWith("cs_live_")
      )
    ) {
      return NextResponse.json(
        {
          error: "A valid Stripe Checkout session is required.",
        },
        { status: 400 }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(
      process.env.STRIPE_SECRET_KEY
    );

    // Retrieve payment session
    const session = await stripe.checkout.sessions.retrieve(
      sessionId
    );

    // Verify payment: $10 USD
    if (
      session.payment_status !== "paid" ||
      session.amount_total !== 1000 ||
      session.currency !== "usd"
    ) {
      return NextResponse.json(
        {
          error: "Payment not verified. Please complete the $10 checkout first.",
        },
        { status: 402 }
      );
    }

    // Get uploaded videos
    const files = form.getAll("videos").filter(
      (file) => file instanceof File && file.size > 0
    );

    // Allow 1 to 3 videos
    if (files.length < 1 || files.length > 3) {
      return NextResponse.json(
        {
          error: "Choose between 1 and 3 videos.",
        },
        { status: 400 }
      );
    }

    // Validate video files
    for (const file of files) {
      if (
        !file.type.startsWith("video/") ||
        file.size > 250 * 1024 * 1024
      ) {
        return NextResponse.json(
          {
            error: "Each file must be a video smaller than 250 MB.",
          },
          { status: 400 }
        );
      }
    }

    // Cat image path
    const imagePath = path.join(
      process.cwd(),
      "public",
      "cat-image.png"
    );

    // Check image exists
    try {
      await access(imagePath);
    } catch {
      return NextResponse.json(
        {
          error: "Missing public/cat-image.png. Add the cat image to the public folder.",
        },
        { status: 400 }
      );
    }

    // Create temporary directory
    tempDir = await mkdtemp(
      path.join(os.tmpdir(), "flashframe-")
    );

    // Create downloads directory
    const outputDir = path.join(
      process.cwd(),
      "public",
      "downloads"
    );

    await mkdir(outputDir, {
      recursive: true,
    });

    const results = [];

    // Process each video
    for (const file of files) {
      const id = randomUUID();

      const inputPath = path.join(
        tempDir,
        `${id}-input`
      );

      const outputName = `${id}.mp4`;

      const outputPath = path.join(
        outputDir,
        outputName
      );

      // Save uploaded video
      await writeFile(
        inputPath,
        Buffer.from(await file.arrayBuffer())
      );

      // Apply full-screen cat image
      await runFFmpeg(
        inputPath,
        imagePath,
        outputPath
      );

      results.push({
        url: `/downloads/${outputName}`,
      });
    }

    // Return processed videos
    return NextResponse.json({
      files: results,
    });

  } catch (error) {
    console.error(
      "FlashFrame processing error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error.message ||
          "Video processing failed.",
      },
      { status: 500 }
    );

  } finally {
    // Remove temporary files
    if (tempDir) {
      await rm(
        tempDir,
        {
          recursive: true,
          force: true,
        }
      ).catch(() => {});
    }
  }
}

