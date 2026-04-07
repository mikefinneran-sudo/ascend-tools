'use strict';

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
const UPSTREAM_URL = 'https://visa-requirement.p.rapidapi.com/v2/visa/check';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    return JSON.parse(body);
  }

  if (Buffer.isBuffer(body)) {
    return JSON.parse(body.toString('utf8'));
  }

  if (typeof body === 'object') {
    return body;
  }

  throw new Error('Unsupported request body');
}

function normalizeCountryCode(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toUpperCase();
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const proxySecret = process.env.ASCEND_PROXY_SECRET;
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  if (!proxySecret || !rapidApiKey) {
    console.error('visa-check: missing required environment variables');
    return sendJson(res, 500, { error: 'Server configuration incomplete' });
  }

  const providedSecret = req.headers['x-ascend-key'];

  if (providedSecret !== proxySecret) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  let body;

  try {
    body = parseBody(req.body);
  } catch (error) {
    console.error('visa-check: invalid request body', error);
    return sendJson(res, 400, { error: 'Invalid JSON body' });
  }

  const passport = normalizeCountryCode(body.passport);
  const destination = normalizeCountryCode(body.destination);

  if (!COUNTRY_CODE_RE.test(passport) || !COUNTRY_CODE_RE.test(destination)) {
    return sendJson(res, 400, { error: 'Passport and destination must be valid ISO alpha-2 country codes' });
  }

  let upstreamResponse;

  try {
    upstreamResponse = await fetch(UPSTREAM_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'visa-requirement.p.rapidapi.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ passport, destination })
    });
  } catch (error) {
    console.error('visa-check: upstream request failed', error);
    return sendJson(res, 502, { error: 'Visa service unavailable' });
  }

  const responseText = await upstreamResponse.text();
  let responsePayload = null;

  if (responseText) {
    try {
      responsePayload = JSON.parse(responseText);
    } catch (error) {
      responsePayload = { error: 'Unexpected upstream response', raw: responseText };
    }
  }

  if (upstreamResponse.status === 429) {
    console.error('visa-check: upstream rate limited request', { passport, destination });
    return sendJson(res, 429, responsePayload || { error: 'Visa service rate limited' });
  }

  if (upstreamResponse.status === 400 || upstreamResponse.status === 422) {
    console.error('visa-check: upstream rejected request', { passport, destination, status: upstreamResponse.status });
    return sendJson(res, 400, responsePayload || { error: 'Invalid visa lookup request' });
  }

  if (!upstreamResponse.ok) {
    console.error('visa-check: unexpected upstream status', { status: upstreamResponse.status });
    return sendJson(res, 502, responsePayload || { error: 'Visa service unavailable' });
  }

  return sendJson(res, 200, responsePayload || {});
};
