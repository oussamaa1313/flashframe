import Stripe from 'stripe';
import {NextResponse} from 'next/server';
export const runtime='nodejs';
export async function POST(){
  // Upload/processing worker is intentionally not enabled in this safe starter.
  // Next step: connect authenticated storage and a branding-only FFmpeg job worker.
  return NextResponse.json({error:'Video processing worker is not connected yet. The checkout UI is ready for Stripe test setup.'},{status:501});
}
