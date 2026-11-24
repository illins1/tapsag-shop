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


// Strong-profanity check (OpenAI's moderation doesn't flag plain cussing).
// Catches "f u c k", "f*ck", "fuuuck" without flagging innocent words (Scunthorpe, shiitake, class).
// Mild words (damn, hell, crap) are intentionally allowed.
const STRONG = ['fuck', 'fck', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'cock', 'pussy', 'whore', 'slut', 'bastard', 'nigg', 'fagg', 'retard'];
const SAFE = ['scunthorpe', 'shitake', 'shiitake', 'cockpit', 'cocktail', 'cockatoo', 'peacock', 'hancock', 'dickens', 'dickinson', 'dickson', 'cockburn', 'babcock', 'woodcock', 'hitchcock', 'bastion'];
const LEET = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '*': 'u', '#': 'u' };
const squash = w => w.replace(/(.)\1+/g, '$1');
const STRONG_SQ = STRONG.map(squash);
const SAFE_SQ = SAFE.map(squash);

function hasStrongProfanity(texts) {
  const raw = texts.filter(Boolean).join(' ').toLowerCase();
  // Join runs of single letters separated by spaces/dots/dashes ("f u c k", "f.u.c.k") into one token.
  const joined = raw.replace(/\b(?:[a-z@$*#0-9][\s._-]+){2,}[a-z@$*#0-9]\b/g, m => m.replace(/[\s._-]+/g, ''));
  const tokens = joined.split(/[^a-z0-9@$*#!]+/).filter(Boolean);
  for (const t of tokens) {
    const w = squash(t.replace(/[@43!10$57*#]/g, c => LEET[c]).replace(/[^a-z]/g, ''));
    if (!w || SAFE_SQ.some(x => w.includes(x))) continue;
    if (STRONG_SQ.some(x => w.includes(x))) return true;
  }
  return false;
}

async function moderate({ texts = [], images = [] }) {
  if (hasStrongProfanity(texts)) { console.warn('moderate: blocked for profanity'); return { ok: false, reason: FRIENDLY }; }
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
