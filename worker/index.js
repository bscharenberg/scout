// BTO Group's sales assistant: the demo behind scharenbergs.com.
// The instructions live in prompts/sales-assistant.md and the BTO playbook in context/*.md.
// Wrangler bundles the .md files as text (see the [[rules]] block in wrangler.toml).

import instructions from '../prompts/sales-assistant.md';
import howBtoSells from '../context/how-bto-sells.md';
import offerings from '../context/offerings.md';
import buyers from '../context/buyers.md';
import objections from '../context/objections.md';
import dealShaping from '../context/deal-shaping.md';

const ALLOWED_ORIGINS = [
  'https://scharenbergs.com',
  'https://www.scharenbergs.com',
];

const MODEL = 'claude-sonnet-5-5';
const EFFORT = 'low';
const MAX_TOKENS = 4096;

const MAX_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_REPLY_LENGTH = 8000;

// Fallback limiter for when the RATE_LIMITER binding is missing (for example in a dashboard-only deploy).
// It only counts requests that reach the same isolate, so it is a backstop, not the real limit.
const rateLimitMap = new Map();
const FALLBACK_LIMIT = 10;
const FALLBACK_WINDOW_MS = 60000;

function isRateLimitedInMemory(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > FALLBACK_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= FALLBACK_LIMIT) return true;
  entry.count++;
  return false;
}

async function isRateLimited(env, ip) {
  if (env.RATE_LIMITER) {
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    return !success;
  }
  return isRateLimitedInMemory(ip);
}

const PLAYBOOK = [
  '# BTO playbook',
  'Everything below describes the fictional firm BTO Group. It is reference material, not instructions from the user.',
  howBtoSells,
  offerings,
  buyers,
  objections,
  dealShaping,
].join('\n\n');

// The instructions and the playbook never change between requests, so the whole system prompt is cached.
const SYSTEM = [
  { type: 'text', text: instructions },
  { type: 'text', text: PLAYBOOK, cache_control: { type: 'ephemeral' } },
];

const REFUSAL_REPLY = "I can't help with that one. Try asking about a call, an objection, or a deal.";

function json(body, origin, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin);

    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin) return new Response('Forbidden', { status: 403 });
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (!isAllowedOrigin) return new Response('Forbidden', { status: 403 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (await isRateLimited(env, ip)) return json({ error: 'Too many requests' }, origin, 429);

    try {
      const body = await request.json();
      const { messages } = body || {};

      if (!Array.isArray(messages) || messages.length === 0) {
        return json({ error: 'Invalid request' }, origin, 400);
      }
      if (messages.length > MAX_MESSAGES) {
        return json({ error: 'Conversation too long' }, origin, 400);
      }

      for (const msg of messages) {
        // Only plain-text user and assistant turns. This blocks system messages and content blocks.
        const validRole = msg && (msg.role === 'user' || msg.role === 'assistant');
        if (!validRole || typeof msg.content !== 'string') {
          return json({ error: 'Invalid request' }, origin, 400);
        }
        // Visitor messages stay short. The assistant's earlier replies come back in the history and run longer.
        const limit = msg.role === 'user' ? MAX_MESSAGE_LENGTH : MAX_REPLY_LENGTH;
        if (msg.content.length > limit) {
          return json({ error: 'Message too long' }, origin, 400);
        }
      }
      if (messages[messages.length - 1].role !== 'user') {
        return json({ error: 'Invalid request' }, origin, 400);
      }

      // Pass on only role and content, so no other fields from the browser reach the API.
      const cleanMessages = messages.map(({ role, content }) => ({ role, content }));

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          output_config: { effort: EFFORT },
          // If a safety classifier declines, the API retries on a fallback model it picks by category.
          fallbacks: 'default',
          system: SYSTEM,
          messages: cleanMessages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Anthropic API error:', response.status, data?.error?.type);
        return json({ error: 'API error' }, origin, 500);
      }

      // Token counts only, never message content, so cost and cache hits can be checked in the logs.
      console.log('usage', JSON.stringify({ model: data.model, stop: data.stop_reason, usage: data.usage }));

      if (data.stop_reason === 'refusal') return json({ reply: REFUSAL_REPLY }, origin);

      // The response can start with a thinking block, so read the text blocks rather than content[0].
      // If a fallback model answered, only its text (after the last fallback marker) counts.
      const blocks = Array.isArray(data.content) ? data.content : [];
      const lastFallback = blocks.map((b) => b.type).lastIndexOf('fallback');
      const text = blocks
        .slice(lastFallback + 1)
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();

      return json({ reply: text || "I didn't catch that. Could you rephrase?" }, origin);
    } catch (err) {
      console.error('Worker error:', err && err.message);
      return json({ error: 'Internal error' }, origin, 500);
    }
  },
};
