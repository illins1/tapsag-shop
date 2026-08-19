// _omnisend-send.js
// Shared helper: upserts the recipient as an Omnisend contact and fires the
// "verse_gift_sent" custom event. Used by send-gift.js (free email path)
// and stripe-webhook.js (paid SMS path, after payment confirms).

const OMNISEND_API_BASE = 'https://api.omnisend.com/api';

async function sendVerseGift({ sender_name, recipient_name, recipient_contact, personal_note, verse_text, verse_ref, gift_id }) {
  const apiKey = process.env.OMNISEND_API_KEY;
  if (!apiKey) {
    throw new Error('Server not configured: missing OMNISEND_API_KEY');
  }
  if (!sender_name || !recipient_name || !recipient_contact || !verse_text) {
    throw new Error('Missing required fields');
  }

  const isEmail = recipient_contact.includes('@');
  // Use the gift_id from save-gift.js if provided (it already has the photo/video
  // stored under this ID) — otherwise fall back to generating one, so this still
  // works even if a caller doesn't save media first.
  const giftId = gift_id || ('g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const siteUrl = process.env.URL || 'https://tapsag.shop';
  const returnLink = `${siteUrl}/g/${giftId}`;

  const contactBody = {
    identifiers: isEmail
      ? [{ type: 'email', id: recipient_contact, channels: { email: { status: 'subscribed', statusDate: new Date().toISOString() } } }]
      : [{ type: 'phone', id: recipient_contact, channels: { sms: { status: 'subscribed', statusDate: new Date().toISOString() } } }],
    firstName: recipient_name
  };

  const contactRes = await fetch(`${OMNISEND_API_BASE}/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Omnisend-API-Key ${apiKey}`,
      'Omnisend-Version': '2026-03-15'
    },
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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Omnisend-API-Key ${apiKey}`,
      'Omnisend-Version': '2026-03-15'
    },
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
