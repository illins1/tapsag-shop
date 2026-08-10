// send-gift.js
// Netlify serverless function — receives a gift-send request from index.html,
// creates/updates the sender as an Omnisend contact, fires the "verse_gift_sent"
// custom event, and returns a shareable link.
//
// REQUIRED SETUP (one-time, cannot be done by code):
// 1. Set environment variable OMNISEND_API_KEY in Netlify dashboard
//    (Site settings > Environment variables) — never hardcode the key here.
// 2. In the Omnisend dashboard, build an automation triggered by the
//    "verse_gift_sent" custom event (Automations > Custom event trigger).
//    There is no API endpoint to create automations — this step is manual.
// 3. Email template inside that automation should use these merge fields,
//    which this function sends as event properties:
//      {{verse_text}}  {{sender_name}}  {{recipient_name}}  {{return_link}}

const OMNISEND_API_BASE = 'https://api.omnisend.com/api';
const OMNISEND_BRAND_ID = '6a21801a96bec9e135e5990a';

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.OMNISEND_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured: missing OMNISEND_API_KEY' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { sender_name, recipient_name, recipient_contact, personal_note, verse_text, verse_ref } = payload;

  if (!sender_name || !recipient_name || !recipient_contact || !verse_text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  // Determine if recipient_contact is an email or phone
  const isEmail = recipient_contact.includes('@');
  const giftId = 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const returnLink = `https://tapsag.shop/g/${giftId}`;

  try {
    // 1. Upsert the recipient as an Omnisend contact
    const contactBody = {
      identifiers: isEmail
        ? [{ type: 'email', id: recipient_contact, channels: { email: { status: 'subscribed', statusDate: new Date().toISOString() } } }]
        : [{ type: 'phone', id: recipient_contact, channels: { sms: { status: 'subscribed', statusDate: new Date().toISOString() } } }],
      firstName: recipient_name
    };

    const contactRes = await fetch(`${OMNISEND_API_BASE}/v3/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify(contactBody)
    });

    if (!contactRes.ok) {
      const errText = await contactRes.text();
      console.error('Omnisend contact upsert failed:', errText);
    }

    // 2. Fire the verse_gift_sent custom event
    const eventBody = {
      email: isEmail ? recipient_contact : undefined,
      phone: !isEmail ? recipient_contact : undefined,
      eventName: 'verse_gift_sent',
      eventTime: new Date().toISOString(),
      properties: {
        sender_name,
        recipient_name,
        verse_text,
        verse_ref: verse_ref || '',
        personal_note: personal_note || '',
        return_link: returnLink,
        gift_id: giftId
      }
    };

    const eventRes = await fetch(`${OMNISEND_API_BASE}/v5/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify(eventBody)
    });

    if (!eventRes.ok) {
      const errText = await eventRes.text();
      console.error('Omnisend event fire failed:', errText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to send gift event' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        giftId,
        shareLink: returnLink
      })
    };

  } catch (err) {
    console.error('send-gift error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
