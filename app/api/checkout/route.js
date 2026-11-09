import Stripe from 'stripe';
import {NextResponse} from 'next/server';
export async function POST(){
  if(!process.env.STRIPE_SECRET_KEY)return NextResponse.json({error:'Stripe test key is not configured.'},{status:503});
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  const origin=process.env.NEXT_PUBLIC_BASE_URL||'http://localhost:3000';
  const session=await stripe.checkout.sessions.create({
    mode:'payment',payment_method_types:['card'],
    line_items:[{price_data:{currency:'usd',unit_amount:1000,product_data:{name:'FlashFrame — 3 video edits',description:'One-time payment for up to three video branding edits.'}},quantity:1}],
    success_url:`${origin}/?paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:`${origin}/?canceled=1`,
    metadata:{product:'flashframe-three-video-pack'}
  });
  return NextResponse.json({url:session.url});
}
