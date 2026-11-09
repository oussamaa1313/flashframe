# FlashFrame MVP — Next.js starter

## Included
- English landing page
- $10 one-time Stripe Checkout for a pack of up to 3 videos
- Post-payment upload workspace UI
- Responsive dark visual design

## Not yet connected
- Secure file upload/storage
- Usage ledger (exactly 3 videos per paid Stripe session)
- Background FFmpeg worker and downloadable outputs
- Stripe webhook, refunds, retention/cleanup and abuse protections

The starter does not include an automated effect intended to conceal rejected or prohibited ad content or evade platform review. A compliant branding workflow can be added (e.g. persistent logo/watermark or an explicit intro/outro).

## Local setup
1. Install Node.js 20+
2. `npm install`
3. Copy `.env.example` to `.env.local`
4. Add Stripe test secret key (`sk_test_...`)
5. Set `NEXT_PUBLIC_BASE_URL=http://localhost:3000`
6. `npm run dev`
7. Open http://localhost:3000

Do not use live Stripe keys until test checkout, webhook verification, upload security and refund flows are tested.
