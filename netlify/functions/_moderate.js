// Content safety check for everything a sender/commenter can add to a gift.
// Uses OpenAI's moderation endpoint (free to call; needs OPENAI_API_KEY in
// Netlify env vars). Checks text AND images. Videos are checked through a few
// still frames the browser grabs from the clip.
//
// If OPENAI_API_KEY is not set, checks are skipped (and logged) so the site keeps
// working. Once the key is set, a failed check BLOCKS the gift (fail closed).

const BLOCK = [
  'sexual', 'sexual/minors',
  'violence/graphic',
  'hate', 'hate/threatening',
  'harassment/threatening',
  'self-harm/intent', 'self-harm/instructions',
  'illicit/violent'
];

const FRIENDLY = 'This content isn’t allowed on Tapsag. Please share something uplifting and appropriate.';

async function moderate({ texts = [], images = [] }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.warn('moderate: OPENAI_API_KEY not set — skipping content check'); return { ok: true, skipped: true }; }

  const input = [];
  const joined = texts.filter(Boolean).join('\n').slice(0, 4000);
  if (joined.trim()) input.push({ type: 'text', text: joined });
  images.filter(Boolean).slice(0, 4).forEach(u => input.push({ type: 'image_url', image_url: { url: u } }));
  if (!input.length) return { ok: true };

  const call = async (inp) => {
    const r = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: inp })
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      const err = new Error('moderation HTTP ' + r.status + ' ' + body.slice(0, 300));
      err.status = r.status;
      throw err;
    }
    return r.json();
  };

  try {
    let data;
    try {
      data = await call(input);
    } catch (e) {
      console.error('moderate error:', e && e.message);
      if (e.status === 400 && images.length) {
        // Bad/oversized image frame: retry with text plus only the first image, then text only.
        const textOnly = input.filter(i => i.type === 'text');
        const firstImg = input.filter(i => i.type === 'image_url').slice(0, 1);
        try { data = await call(textOnly.concat(firstImg)); }
        catch (e2) {
          console.error('moderate retry error:', e2 && e2.message);
          if (!textOnly.length) return { ok: true, skipped: true };
          data = await call(textOnly);
        }
      } else if (e.status === 429 || e.status >= 500) {
        await new Promise(r => setTimeout(r, 800));
        data = await call(input);
      } else {
        throw e;
      }
    }
    for (const res of data.results || []) {
      const hit = BLOCK.find(c => res.categories && res.categories[c]);
      if (hit) { console.warn('moderate: blocked for', hit); return { ok: false, reason: FRIENDLY }; }
    }
    return { ok: true };
  } catch (e) {
    console.error('moderate final error:', e && e.message);
    return { ok: false, reason: 'We couldn’t verify this content right now. Please try again in a moment.' };
  }
}

module.exports = { moderate };
