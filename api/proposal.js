'use strict';

const fs = require('fs');
const path = require('path');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';
const ANTHROPIC_VERSION = '2023-06-01';
const GAMMA_URL = 'https://public-api.gamma.app/v1.0/generations';
const PROMPT_PATH = path.join(__dirname, '_prompts', 'sales-proposal.md');

let cachedPrompt = null;

function loadPrompt() {
  if (cachedPrompt === null) {
    cachedPrompt = fs.readFileSync(PROMPT_PATH, 'utf8');
  }
  return cachedPrompt;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString('utf8'));
  if (typeof body === 'object') return body;
  throw new Error('Unsupported request body');
}

function validateBrief(brief) {
  const errors = [];
  if (!brief || typeof brief !== 'object') {
    return ['Brief must be an object'];
  }
  if (!brief.client || typeof brief.client.company !== 'string' || !brief.client.company.trim()) {
    errors.push('client.company is required');
  }
  if (!brief.ae || typeof brief.ae.name !== 'string' || !brief.ae.name.trim()) {
    errors.push('ae.name is required');
  }
  return errors;
}

async function generateMarkdown(brief) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY not configured');
    err.statusCode = 500;
    throw err;
  }

  const systemPrompt = loadPrompt();
  const userMessage = `Intake brief:\n\n\`\`\`json\n${JSON.stringify(brief, null, 2)}\n\`\`\``;

  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(25000),
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  const text = await response.text();
  if (!response.ok) {
    console.error('proposal: anthropic non-2xx', { status: response.status, body: text.slice(0, 500) });
    const err = new Error('Generation upstream failed');
    err.statusCode = 502;
    throw err;
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (parseErr) {
    console.error('proposal: anthropic invalid JSON', parseErr);
    const err = new Error('Generation returned invalid JSON');
    err.statusCode = 502;
    throw err;
  }

  const block = Array.isArray(payload.content) ? payload.content.find((c) => c.type === 'text') : null;
  const markdown = block && typeof block.text === 'string' ? block.text.trim() : '';
  if (!markdown) {
    const err = new Error('Generation returned empty content');
    err.statusCode = 502;
    throw err;
  }

  return markdown;
}

async function createGammaDeck(markdown, brief) {
  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: 'GAMMA_API_KEY not configured' };
  }

  const safeClient = (brief.client && brief.client.company ? brief.client.company : 'Prospect')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .slice(0, 60);

  const response = await fetch(GAMMA_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputText: markdown,
      textMode: 'preserve',
      format: 'presentation',
      cardSplit: 'inputTextBreaks',
      cardOptions: { dimensions: 'fluid' },
      imageOptions: { source: 'noImages' },
      sharingOptions: { workspaceAccess: 'view', externalAccess: 'view' },
      additionalInstructions: `Apply Ascend brand: primary purple #6F57FF, midnight #1E2F39 for dark backgrounds, Sky #E0EFFF and Land olive #727841 as accents. Geometric sans-serif typography (FT System if available, otherwise Inter or Helvetica Neue). Mono for tags, codes, and pills. The deck explicitly embeds the Ascend logo via image markdown — do not replace or remove these images. Title the deck: Ascend × ${safeClient}.`
    })
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch (_) { payload = { raw: text }; }
  }

  if (!response.ok) {
    console.error('proposal: gamma non-2xx', { status: response.status, body: text.slice(0, 500) });
    return { skipped: false, error: `Gamma API ${response.status}`, detail: payload };
  }

  return { skipped: false, generation: payload };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const proxySecret = process.env.ASCEND_PROXY_SECRET;
  if (!proxySecret) {
    console.error('proposal: ASCEND_PROXY_SECRET not configured');
    return sendJson(res, 500, { error: 'Server configuration incomplete' });
  }

  if (req.headers['x-ascend-key'] !== proxySecret) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  let brief;
  try {
    brief = parseBody(req.body);
  } catch (error) {
    return sendJson(res, 400, { error: 'Invalid JSON body' });
  }

  const validationErrors = validateBrief(brief);
  if (validationErrors.length > 0) {
    return sendJson(res, 400, { error: 'Invalid brief', details: validationErrors });
  }

  let markdown;
  try {
    markdown = await generateMarkdown(brief);
  } catch (error) {
    console.error('proposal: generation failed', error);
    return sendJson(res, error.statusCode || 502, { error: error.message || 'Generation failed' });
  }

  if (markdown.startsWith('INSUFFICIENT_BRIEF')) {
    return sendJson(res, 422, { error: 'Insufficient brief', detail: markdown });
  }

  const gamma = await createGammaDeck(markdown, brief);

  return sendJson(res, 200, {
    markdown,
    gamma,
    meta: {
      model: ANTHROPIC_MODEL,
      generated_at: new Date().toISOString(),
      client: brief.client.company
    }
  });
};
