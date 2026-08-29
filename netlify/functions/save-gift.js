// save-gift.js
// Stores the gift's media (photo/video as base64) + verse + message in
// Netlify Blobs, keyed by a generated gift_id. This runs BEFORE send-gift.js
// (free/email path) or create-checkout-session.js (paid/text path) so both
// delivery channels reference the same stored gift record.
//
// Netlify Blobs requires no separate account/API key — it's built into the
// Netlify site itself and works automatically once @netlify/blobs is a
// dependency (see package.json) and the site is deployed on Netlify.

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { mediaType, mediaData, verse_text, verse_ref, sender_name, recipient_name, personal_note } = payload;

  if (!mediaType || !mediaData || !verse_text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing mediaType, mediaData, or verse_text' }) };
  }

  // Rough size guard — base64 video from a phone can get large fast.
  // Netlify Blobs supports large values, but keep a sane ceiling (~18MB base64).
  if (mediaData.length > 18_000_000) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Media file too large. Try a shorter video or a photo instead.' }) };
  }

  const giftId = 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const record = {
    giftId,
    mediaType,       // 'photo' | 'video'
    mediaData,        // base64 data URL
    verse_text,
    verse_ref: verse_ref || '',
    sender_name: sender_name || '',
    recipient_name: recipient_name || '',
    personal_note: personal_note || '',
    createdAt: new Date().toISOString()
  };

  try {
    const store = getStore({
      name: 'tapsag-gifts',
      siteID: process.env.SITE_ID || process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN
    });
    await store.setJSON(giftId, record);
    return { statusCode: 200, body: JSON.stringify({ giftId }) };
  } catch (err) {
    console.error('save-gift error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save gift' }) };
  }
};
