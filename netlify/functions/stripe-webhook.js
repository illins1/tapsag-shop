// stripe-webhook.js
// Verifies the Stripe webhook signature manually (HMAC-SHA256, no SDK needed)
// and, on successful payment, fires the real gift-send event via Omnisend.

const crypto = require('crypto');
const { sendVerseGift } = require('./_omnisend-send');

function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = Object.fromEntries(
    sigHeader.split(',').map(kv => {
      const [k, v] = kv.split('=');
      return [k, v];
    })
  );
  const signedPayload = `${parts.t}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 || ''));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sigHeader = event.headers['stripe-signature'];

  if (!webhookSecret || !sigHeader) {
    return { statusCode: 400, body: 'Missing webhook secret or signature header' };
  }

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;

  let validSig = false;
  try {
    validSig = verifyStripeSignature(rawBody, sigHeader, webhookSecret);
  } catch (e) {
    validSig = false;
  }
  if (!validSig) {
    return { statusCode: 400, body: 'Invalid signature' };
  }

  const stripeEvent = JSON.parse(rawBody);

  if (stripeEvent.type === 'checkout.session.completed') {
    const meta = stripeEvent.data.object.metadata || {};
    try {
      await sendVerseGift({
        sender_name: meta.sender_name,
        recipient_name: meta.recipient_name,
        recipient_contact: meta.recipient_contact,
        personal_note: meta.personal_note,
        verse_text: meta.verse_text,
        verse_ref: meta.verse_ref
      });
    } catch (err) {
      console.error('Failed to send gift after payment:', err);
      // Still return 200 so Stripe doesn't retry indefinitely on our bug —
      // log this and handle failed sends manually/via Omnisend dashboard.
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
