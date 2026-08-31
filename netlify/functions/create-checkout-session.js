// create-checkout-session.js
// Creates a Stripe Checkout Session for the $2 paid SMS-delivery path.
// Calls Stripe's REST API directly (no stripe npm package needed).

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured: missing STRIPE_SECRET_KEY' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { sender_name, recipient_name, recipient_contact, personal_note, verse_text, verse_ref, gift_id } = data;
  if (!sender_name || !recipient_name || !recipient_contact || !verse_text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }
  if (!gift_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing gift_id — save the gift media first via /save-gift' }) };
  }

  const siteUrl = process.env.URL || 'https://tapsag.shop';

  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('success_url', `${siteUrl}/success.html?gift_id=${encodeURIComponent(gift_id)}&session_id={CHECKOUT_SESSION_ID}`);
  params.append('cancel_url', `${siteUrl}/`);
  params.append('line_items[0][price_data][currency]', 'usd');
  params.append('line_items[0][price_data][product_data][name]', 'Tapsag — Text Delivery');
  params.append('line_items[0][price_data][unit_amount]', '199');
  params.append('line_items[0][quantity]', '1');
  params.append('metadata[sender_name]', sender_name);
  params.append('metadata[recipient_name]', recipient_name);
  params.append('metadata[recipient_contact]', recipient_contact);
  params.append('metadata[personal_note]', personal_note || '');
  params.append('metadata[verse_text]', verse_text);
  params.append('metadata[verse_ref]', verse_ref || '');
  params.append('metadata[gift_id]', gift_id);

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await res.json();
    if (!res.ok) {
      console.error('Stripe session creation failed:', session);
      return { statusCode: 502, body: JSON.stringify({ error: session.error?.message || 'Stripe error' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create checkout session' }) };
  }
};
