// _omnisend-send.js
// (kept this filename so send-gift.js / stripe-webhook.js don't need changes)
//
// Sends the verse gift directly via Resend's transactional email API —
// no automation builder, no store connection required. Omnisend's
// automation system needs a connected ecommerce store even for
// custom-event-triggered workflows, which Tapsag doesn't have, so
// that path is dead. Resend just sends the email immediately via one
// API call, which is exactly what this needs.
//
// SMS delivery (the paid $3.99 text path) is NOT wired to a provider
// yet — that requires a separate service (e.g. Twilio) with its own
// account and phone number. Calling this for a phone contact will
// throw a clear "not configured" error rather than fail silently.

const RESEND_API_BASE = 'https://api.resend.com';

function buildEmailHtml({ sender_name, recipient_name, verse_text, verse_ref, personal_note, returnLink }) {
  return `
  <div style="background:#0C0B14;padding:32px 16px;font-family:Georgia,serif;">
    <div style="max-width:480px;margin:0 auto;background:#13111F;border:1px solid rgba(201,168,76,.25);border-radius:14px;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:20px;">
        <span style="display:inline-block;width:40px;height:40px;border-radius:9px;background:linear-gradient(135deg,#8A6E2A,#E4C76B);color:#08070F;font-size:20px;font-weight:bold;line-height:40px;">T</span>
      </div>
      <p style="color:#8A8070;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;text-align:center;margin:0 0 6px;">A Word of Inspiration for ${recipient_name}</p>
      <p style="color:#E4C76B;font-size:11px;text-transform:uppercase;letter-spacing:1px;text-align:center;margin:0 0 16px;">${verse_ref || ''}</p>
      <p style="color:#EDE8DA;font-size:19px;font-style:italic;line-height:1.6;text-align:center;margin:0 0 20px;">"${verse_text}"</p>
      ${personal_note ? `<p style="color:#c9c4b6;font-size:14px;line-height:1.6;text-align:center;border-top:1px solid rgba(201,168,76,.2);padding-top:16px;margin:0 0 20px;">${personal_note}</p>` : ''}
      <p style="color:#8A8070;font-size:13px;text-align:center;margin:0 0 24px;">With love, ${sender_name}</p>
      <div style="text-align:center;">
        <a href="${returnLink}" style="display:inline-block;background:linear-gradient(135deg,#8A6E2A,#E4C76B);color:#08070F;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">View Your Gift</a>
      </div>
      <p style="color:#4A4438;font-size:11px;text-align:center;margin:24px 0 0;">Sent with love via Tapsag</p>
    </div>
  </div>`;
}

async function sendVerseGift({ sender_name, recipient_name, recipient_contact, personal_note, verse_text, verse_ref, gift_id }) {
  if (!sender_name || !recipient_name || !recipient_contact || !verse_text) {
    throw new Error('Missing required fields');
  }

  const isEmail = recipient_contact.includes('@');
  const giftId = gift_id || ('g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const siteUrl = process.env.URL || 'https://tapsag.shop';
  const returnLink = `${siteUrl}/g/${giftId}`;

  if (!isEmail) {
    // SMS not wired to a provider yet — fail loudly and clearly instead of
    // pretending it worked, so this shows up as an obvious "still needs setup"
    // message rather than a mystery silent failure.
    throw new Error('Text delivery is not connected to an SMS provider yet — this needs to be set up before the paid text path can send.');
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Server not configured: missing RESEND_API_KEY');
  }

  const res = await fetch(`${RESEND_API_BASE}/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from: 'Tapsag <gifts@tapsag.shop>',
      to: [recipient_contact],
      subject: `${sender_name} sent you a verse gift`,
      html: buildEmailHtml({ sender_name, recipient_name, verse_text, verse_ref, personal_note, returnLink })
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Resend send failed:', errText);
    throw new Error('Failed to send gift email');
  }

  return { giftId, shareLink: returnLink, isEmail };
}

module.exports = { sendVerseGift };
