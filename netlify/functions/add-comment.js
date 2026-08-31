// add-comment.js
// Adds a simple one-way "guestbook" reply to an existing gift record.
// No threading, no real-time chat — just appends {name, message, at} to the
// gift's comments array and saves it back to the same Netlify Blobs record
// that save-gift.js/get-gift.js already use.

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

  const giftId = (payload.giftId || '').trim();
  const message = (payload.message || '').trim();
  const name = (payload.name || 'Someone').trim().slice(0, 60);

  if (!giftId || !message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'giftId and message are required' }) };
  }
  if (message.length > 300) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Message too long (300 characters max)' }) };
  }

  try {
    const store = getStore({
      name: 'tapsag-gifts',
      siteID: process.env.SITE_ID || process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN
    });

    const record = await store.get(giftId, { type: 'json' });
    if (!record) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Gift not found' }) };
    }

    if (!Array.isArray(record.comments)) record.comments = [];
    // Cap stored replies so one gift can't grow unbounded.
    if (record.comments.length >= 100) {
      return { statusCode: 429, body: JSON.stringify({ error: 'This gift already has the max number of replies' }) };
    }
    record.comments.push({ name, message, at: new Date().toISOString() });

    await store.setJSON(giftId, record);
    return { statusCode: 200, body: JSON.stringify({ comments: record.comments }) };
  } catch (err) {
    console.error('add-comment error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save reply' }) };
  }
};
