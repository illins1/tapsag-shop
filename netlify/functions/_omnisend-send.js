// _omnisend-send.js
// Shared helper: upserts the recipient as an Omnisend contact and fires the
// "verse_gift_sent" custom event. Used by send-gift.js (free email path)
// and stripe-webhook.js (paid SMS path, after payment confirms).

const OMNISEND_API_BASE = 'https://api.omnisend.com/api';

async function sendVerseGift({ sender_name, recipient_name, recipient_contact, personal_note, verse_text, verse_ref }) {
  const apiKey = process.env.OMNISEND_API_KEY;
  if (!apiKey) {
    throw new Error('Server not configured: missing OMNISEND_API_KEY');
  }
  if (!sender_name || !recipient_name || !recipient_contact || !verse_text) {
    throw new Error('Missing required fields');
  }

  const isEmail = recipient_contact.includes('@');
  const giftId = 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const returnLink = `https://tapsag.shop/g/${giftId}`;

  const contactBody = {
    identifiers: isEmail
      ? [{ type: 'email', id: recipient_contact, channels: { email: { status: 'subscribed', statusDate: new Date().toISOString() } } }]
      : [{ type: 'phone', id: recipient_contact, channels: { sms: { status: 'subscribed', statusDate: new Date().toISOString() } } }],
    firstName: recipient_name
  };

  const contactRes = await fetch(`${OMNISEND_API_BASE}/v3/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify(contactBody)
  });
  if (!contactRes.ok) {
    console.error('Omnisend contact upsert failed:', await contactRes.text());
  }

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
      gift_id: giftId,
      channel: isEmail ? 'email' : 'sms'
    }
  };

  const eventRes = await fetch(`${OMNISEND_API_BASE}/v5/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify(eventBody)
  });
  if (!eventRes.ok) {
    const errText = await eventRes.text();
    console.error('Omnisend event fire failed:', errText);
    throw new Error('Failed to send gift event');
  }

  return { giftId, shareLink: returnLink, isEmail };
}

module.exports = { sendVerseGift };
