// set-theme.js
// Owner-only. Saves (or clears) the background for a church/business slug.
// The lock is the OWNER_KEY environment variable in Netlify — it is never in the
// page code. Wrong or missing key = nothing changes.

const crypto = require('crypto');
const { withStore } = require('./_store');

const SLUG_RE = /^[a-z0-9-]{1,40}$/;
const MAX_BG_CHARS = 900000; // ~650KB image, safely under Netlify's payload cap

function keyOk(given) {
  const real = process.env.OWNER_KEY || '';
  if (!real || !given) return false;
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) }; }

  if (!keyOk(event.headers['x-owner-key'] || body.key)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not allowed' }) };
  }

  const slug = String(body.slug || 'default').toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad slug' }) };
  }

  try {
    if (body.clear) {
      await withStore(event, (store) => store.delete('theme-' + slug));
      return { statusCode: 200, body: JSON.stringify({ ok: true, slug, bg: null }) };
    }
    const bg = String(body.bg || '');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(bg)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Image required' }) };
    }
    if (bg.length > MAX_BG_CHARS) {
      return { statusCode: 413, body: JSON.stringify({ error: 'Image too large' }) };
    }
    const name = String(body.name || '').slice(0, 60);
    await withStore(event, (store) =>
      store.setJSON('theme-' + slug, { slug, name, bg, updated: new Date().toISOString() })
    );
    return { statusCode: 200, body: JSON.stringify({ ok: true, slug }) };
  } catch (err) {
    console.error('set-theme error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not save background' }) };
  }
};
