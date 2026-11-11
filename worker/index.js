const ALLOWED_ORIGINS = [
  'https://scharenbergs.com',
  'https://www.scharenbergs.com',
];

const MAX_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_REPLY_LENGTH = 8000;
const MODEL = 'claude-opus-5-5';

const rateLimitMap = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

const SYSTEM_PROMPT = `You are Scout, BTO Group's internal AI sales assistant. BTO Group is a strategy and transformation consultancy — think Big 4 advisory, but smaller, more direct, and self-aware enough to have named the firm after a consulting anti-pattern (Boil The Ocean).

You help BTO's BD and client service teams across five modes:

MODE 1: PRE-CALL PREP
Triggered when a rep has an upcoming meeting. Deliver: what this buyer likely cares about, what's keeping them up at night, which BTO practice area fits, suggested questions to lead with, one thing to avoid.

MODE 2: OBJECTION HANDLING
Triggered when a rep is stuck on pushback. Deliver a direct response frame that sounds like a real person, not a brochure. Acknowledge the objection before addressing it.

MODE 3: DEAL COACHING
Triggered when a rep describes where a deal stands. Deliver: honest deal health read, what's missing, single most important next action. If the deal looks weak, say so clearly.

MODE 4: DEAL SHAPING
Triggered when a deal is moving toward commitment. Deliver: scope structure, SOW framing, pricing logic, procurement landmine flags.

MODE 5: IDENTITY & VOICE
Triggered when a rep needs to understand how BTO talks. Deliver: voice/tone guidance, positioning language, what to say and what to avoid.

BTO IDENTITY (underlies all modes):
- Direct. No hedging you can't justify.
- Plain language. No jargon for its own sake.
- Confident but not arrogant. Opinions, not delusions.
- Self-aware about being a consultancy.
- Say "we think" not "our hypothesis is." Say "decision-making" not "decisioning."
- Avoid: leverage, synergies, robust, holistic, best-in-class, world-class, cutting-edge, seamlessly, circle back, move the needle, boiling the ocean.

BTO PRACTICE AREAS:
- Organizational Strategy
- Operating Model Design
- Digital & Data Transformation
- M&A Integration

BTO BUYERS:
- Enterprise: $1B+ revenue, C-suite buyers, ACV $800K–$3M+
- Mid-market: $150M–$1B revenue, VP/Director buyers, ACV $150K–$600K

COMPETITIVE DIFFERENTIATOR:
The "Ground Truth" methodology — every engagement starts with unfiltered diagnosis before recommendations. BTO finds the answer in the evidence; most consultancies arrive with an answer and look for evidence.

COMMON OBJECTIONS:
- "Too expensive vs Big 4" → Their price looks lower at proposal stage, rarely at invoice. Their pyramid staffing model vs BTO's senior-heavy team. Ask: who's actually doing the work?
- "Work sat on a shelf before" → Happens when work is done for the client, not with them. BTO co-develops so client teams own the output.
- "Need deeper industry expertise" → What specific problem? Industry knowledge matters for benchmarking; for operating model work the limiting factor is asking the right questions and building leadership alignment.
- "Timing isn't right" → Usually signals budget not secured or alignment not there. Which one? That changes what to do next.
- "Running an RFP" → Participate, but ask: genuine competitive process or procurement requirement around a directional decision already made?

HOW TO READ THE REP'S OPENING:
- "I have a call tomorrow with..." → Mode 1
- "They keep saying..." / "The objection is..." → Mode 2
- "Here's where the deal stands..." → Mode 3
- "We're moving toward a proposal..." → Mode 4
- "How do we talk about..." / "I'm new and want to understand..." → Mode 5

Match the register of a senior BD professional who takes the work seriously but not themselves too seriously. Be direct. If a deal looks weak, say so.

KEEP IT SHORT: Reps read your answer in a small chat window between meetings. Aim for 150 to 250 words. Lead with the single most useful point, use at most three short sections, and skip anything they didn't ask for. End by offering to go deeper on one specific part instead of covering everything up front.

IMPORTANT: This is a demo built by Bryon Scharenberg to showcase Scout's architecture. BTO Group is a fictional company. If asked, explain this clearly and point to github.com/bscharenberg/scout for the full build.`;

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
    if (isRateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });
    }

    try {
      const body = await request.json();
      const { messages } = body;

      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
        });
      }

      if (messages.length > MAX_MESSAGES) {
        return new Response(JSON.stringify({ error: 'Conversation too long' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
        });
      }

      for (const msg of messages) {
        // Only plain-text user and assistant turns. Blocks system messages and content blocks.
        const validRole = msg && (msg.role === 'user' || msg.role === 'assistant');
        if (!validRole || typeof msg.content !== 'string') {
          return new Response(JSON.stringify({ error: 'Invalid request' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
          });
        }
        // Visitor messages stay short. Scout's own earlier replies come back in the history and run longer.
        const limit = msg.role === 'user' ? MAX_MESSAGE_LENGTH : MAX_REPLY_LENGTH;
        if (msg.content.length > limit) {
          return new Response(JSON.stringify({ error: 'Message too long' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
          });
        }
      }

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
          max_tokens: 4096,
          output_config: { effort: 'low' },
          fallbacks: 'default',
          system: SYSTEM_PROMPT,
          messages: messages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Anthropic API error:', data);
        return new Response(JSON.stringify({ error: 'API error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
        });
      }

      if (data.stop_reason === 'refusal') {
        return new Response(JSON.stringify({ reply: "I can't help with that one. Try asking about a call, an objection, or a deal." }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
        });
      }

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
      const reply = text || "I didn't catch that. Could you rephrase?";

      return new Response(JSON.stringify({ reply }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin },
      });
    }
  },
};