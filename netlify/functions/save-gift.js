// Blobs requires no separate account/API key — it's built into the
// Netlify site itself and works automatically once @netlify/blobs is a
// dependency (see package.json) and the site is deployed on Netlify.

const { withStore } = require('./_store');
const { moderate } = require('./_moderate');

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

  const { mediaType, mediaData, mediaFrames, verse_text, verse_ref, sender_name, recipient_name, personal_note } = payload;

  if (!mediaType || !mediaData || !verse_text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing mediaType, mediaData, or verse_text' }) };
  }

  // Rough size guard — base64 video from a phone can get large fast.
  // Netlify Blobs supports large values, but keep a sane ceiling (~18MB base64).
  if (mediaData.length > 18_000_000) {
    return { statusCode: 413, body: JSON.stringify({ error: 'Media file too large. Try a shorter video or a photo instead.' }) };
  }

  // Content safety: note + names as text, photo itself or 3 video stills as images.
  const images = mediaType === 'video'
    ? (Array.isArray(mediaFrames) ? mediaFrames.filter(f => typeof f === 'string' && f.startsWith('data:image/')).slice(0, 3) : [])
    : (typeof mediaData === 'string' && mediaData.startsWith('data:image/') ? [mediaData] : []);
  const check = await moderate({ texts: [personal_note, sender_name, recipient_name], images });
  if (!check.ok) {
    return { statusCode: 422, body: JSON.stringify({ error: check.reason }) };
  }

  const giftId = 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const record = {
    giftId,
    mediaType,       // 'photo' | 'video'
    mediaData,       // base64 data URL
    verse_text,
    verse_ref: verse_ref || '',
    sender_name: sender_name || '',
    recipient_name: recipient_name || '',
    personal_note: personal_note || '',
    comments: [],
    createdAt: new Date().toISOString()
  };

  try {
    await withStore(event, (store) => store.setJSON(giftId, record));
    return { statusCode: 200, body: JSON.stringify({ giftId }) };
  } catch (err) {
    console.error('save-gift error:', err && err.message, err && err.blobErrors);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not save gift media: ' + String((err && err.message) || 'server error').slice(0, 160) }) };
  }
};
