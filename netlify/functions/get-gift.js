// get-gift.js
// Retrieves a stored gift record by gift_id. Used by:
// - success.html (sender's confirmation screen)
// - index.html gift-view mode, at /g/:giftId (recipient's screen)

const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const giftId = event.queryStringParameters && event.queryStringParameters.id;
  if (!giftId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
  }

  try {
    const store = getStore('tapsag-gifts');
    const record = await store.get(giftId, { type: 'json' });
    if (!record) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Gift not found' }) };
    }
    return { statusCode: 200, body: JSON.stringify(record) };
  } catch (err) {
    console.error('get-gift error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to load gift' }) };
  }
};
