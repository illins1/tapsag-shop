// send-gift.js
// FREE delivery path — email only. Text/SMS delivery is paid and goes
// through create-checkout-session.js -> Stripe -> stripe-webhook.js instead.
//
// REQUIRED SETUP (one-time, cannot be done by code):
// 1. Set environment variable OMNISEND_API_KEY in Netlify dashboard
//    (Site settings > Environment variables) — never hardcode the key.
// 2. In the Omnisend dashboard, build an automation triggered by the
//    "verse_gift_sent" custom event (Automations > Custom event trigger).
//    There is no API endpoint to create automations — this step is manual.
// 3. Email template inside that automation should use these merge fields:
//    {{verse_text}}  {{sender_name}}  {{recipient_name}}  {{return_link}}

const { sendVerseGift } = require('./_omnisend-send');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (payload.recipient_contact && !payload.recipient_contact.includes('@')) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Text delivery requires payment — use the paid checkout flow instead.' })
    };
  }

  try {
    const result = await sendVerseGift(payload);
    return { statusCode: 200, body: JSON.stringify({ success: true, ...result }) };
  } catch (err) {
    console.error('send-gift error:', err);
    const status = /missing OMNISEND_API_KEY|Missing required fields/.test(err.message) ? 400 : 500;
    return { statusCode: status, body: JSON.stringify({ error: err.message }) };
  }
};
