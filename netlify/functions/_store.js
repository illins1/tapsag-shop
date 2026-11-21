// _store.js — one place that opens the Netlify Blobs store for all gift functions.
// Tries the explicit site ID + token first, then falls back to Netlify's built-in
// automatic connection. If both fail, the error says why (secrets are never included).
const { getStore, connectLambda } = require('@netlify/blobs');

const NAME = 'tapsag-gifts';

async function withStore(event, fn) {
  const errors = [];
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    try {
      return await fn(getStore({ name: NAME, siteID, token }));
    } catch (e) {
      errors.push('token: ' + ((e && e.message) || e));
    }
  } else {
    errors.push('token: ' + (!siteID ? 'no site id' : 'no token') + ' in environment');
  }

  try {
    connectLambda(event);
    return await fn(getStore(NAME));
  } catch (e) {
    errors.push('auto: ' + ((e && e.message) || e));
  }

  const err = new Error(errors.join(' | ').slice(0, 300));
  err.blobErrors = errors;
  throw err;
}

module.exports = { withStore };
