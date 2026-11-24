// get-theme.js
// Public, read-only. Returns the saved background for a church/business slug
// (or "default" for the main site). Used by index.html on every page load.

const { withStore } = require('./_store');

const SLUG_RE = /^[a-z0-9-]{1,40}$/;

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  const slug = ((event.queryStringParameters && event.queryStringParameters.slug) || 'default').toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad slug' }) };
  }
  try {
    const rec = await withStore(event, (store) => store.get('theme-' + slug, { type: 'json' }));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(rec || { slug, bg: null }),
    };
  } catch (err) {
    console.error('get-theme error:', err);
    // Never break the page over a background; just show the default look.
    return { statusCode: 200, body: JSON.stringify({ slug, bg: null }) };
  }
};
