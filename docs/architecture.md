# Scout Architecture

This document explains the design decisions behind Scout v1, the tradeoffs made deliberately, and what a production v2 would look like. It is written for a technical reader who wants to understand not just what was built but why.

---

## The Core Question

The first architectural decision for any AI-powered tool is not which model to use or how to structure the data. It is: **what is the right level of complexity for what this needs to do?**

Scout's job is to help a sales rep prepare for a conversation, handle an objection, coach a deal, shape a proposal, or get grounded in how the firm talks. All five of those tasks share a common shape: the rep brings context, Scout brings structured firm knowledge, and the combination produces something useful.

That is a retrieval-augmented generation problem at its core. But the scale of the knowledge base in v1 (a few thousand words across a handful of documents) does not require a vector store. The interaction pattern (conversational, single-user, no real-time data dependencies) does not require an agent framework. The deployment context (portfolio project, not production SaaS) does not require an API layer.

So v1 is a Claude Project. Not because that is the ceiling of what could be built, but because it is the right tool for the actual problem at this scale, and building more infrastructure would have added complexity without adding capability.

That is a product decision. It is documented here so it reads as intentional, not as a limitation.

---

## v1 Architecture

### What It Is

A Claude Project with a structured system prompt and a knowledge base loaded as project documents. The interface is the Claude chat UI. There is no custom code in v1.

### Components

**System prompt (`prompts/system_prompt.md`)**

The system prompt does three things: it establishes Scout's identity and voice, it defines the five modes and how to detect them from rep input, and it sets behavioral guardrails (no fabricated proof points, no hallucinated client names, one clarifying question when context is insufficient).

All prompts are versioned in `prompts/` rather than living only inside the Claude Project. This is a discipline choice: prompts are logic, and logic belongs in version control.

**Knowledge base (`knowledge/`)**

The knowledge base is structured as discrete documents rather than one large file. This is intentional. Discrete documents let Claude cite and reason about specific sections more reliably than a single wall of text. It also makes the repo more readable to a human evaluating the project.

The documents and their purpose:

- `company_profile.md` — who BTO Group is, how they sell, what makes them distinctive. The identity foundation.
- `practice_areas.md` — four offerings with triggers, methodology POV, and objection frames baked in at the practice level.
- `personas.md` — three buyer archetypes with buying psychology, not just titles. The CFO persona includes what makes them say no, which is more useful than what makes them say yes.
- `objection_bank.md` — common objections with response frames written in BTO's voice. Not generic rebuttals.
- `deal_snapshots.md` — three sample deals seeded across modes, each with deliberate ambiguity and coaching complexity. Hartwell Industrial (deal coaching), Cascade Health (pre-call prep), Meridian Capital (deal shaping).
- `deal_shaping_guide.md` — proposal structure, SOW elements, pricing principles, procurement landmine breakdowns by buyer type. The most operationally specific document in the knowledge base.

**BTO identity layer**

The identity layer is not a separate document in v1. It is woven into the system prompt and into every knowledge document. Practice area descriptions are written in BTO's voice. Objection frames use BTO's language patterns. The persona cards reflect BTO's selling philosophy.

This means Scout does not retrieve identity information and then apply it. It is constitutive, not additive. In v2, the identity layer would be explicit: a standalone document that can be updated independently of the system prompt, versioned separately, and tested in isolation.

### What v1 Does Not Have

- No vector store or semantic retrieval. Claude Project context holds the full knowledge base comfortably at current scale.
- No tool use or function calling. Scout cannot look up live CRM data, search external sources, or call APIs.
- No eval harness. Response quality is assessed manually by using Scout the way a rep would.
- No custom UI. The interface is Claude.ai.
- No API layer. There are no endpoints to call programmatically.

These are not oversights. They are the scope of v1.

---

## v2 Architecture

v2 is the production-grade version of Scout. The design below reflects what would be required to deploy Scout inside a real firm: multiple users, a larger and evolving knowledge base, CRM integration, and measurable reliability.

### Component Changes

**Vector store and RAG pipeline**

At scale, a consulting firm's knowledge base grows: win/loss analysis, updated battle cards, new practice area content, engagement retrospectives. Claude Project context windows have limits, and more importantly, dumping everything into context is not selective retrieval.

v2 uses a vector store (LanceDB for simplicity, Pinecone for scale) to index the knowledge base. Each document chunk is embedded at ingest time. At query time, Scout retrieves the top-k most relevant chunks and injects them into the prompt alongside the rep's input.

This is why the knowledge base is structured as discrete documents now: the chunking and embedding strategy is cleaner when the source material has clear boundaries and consistent formatting.

**Tool use**

v2 Scout has access to a small set of structured tools:

- `get_account_brief(company_name, industry)` — returns a structured pre-call brief template populated with relevant persona and practice area context
- `search_objection_bank(objection_text)` — semantic search over objection/response pairs, returns the closest matches with confidence scores
- `analyze_deal(deal_context)` — structured deal health analysis: stakeholder coverage, stage appropriateness, risk flags, recommended next action
- `generate_sow_outline(engagement_type, scope_notes)` — returns a draft SOW structure with placeholder sections based on engagement type

Tool schemas are defined in `scout/schemas.py`. Inputs and outputs are typed with Pydantic. This makes the tools testable independently of the full agent.

**CRM integration**

The highest-value v2 addition is read access to live deal data. When a rep asks Scout to coach a deal, the ideal input is not a rep's verbal summary of the deal state. It is the actual CRM record: stage, last activity, stakeholders logged, notes, days since last contact.

v2 adds a `get_deal_context(deal_id)` tool that reads from HubSpot or Salesforce via API. The rep can reference a deal by name or ID and Scout retrieves the current state without the rep having to narrate it.

This also enables proactive coaching: a scheduled job surfaces deals with risk signals (no activity in 14 days, missing economic buyer contact, proposal submitted with no follow-up) and prompts Scout to generate a coaching brief.

**Eval harness**

v1 quality is assessed by feel. That is fine for a portfolio project. It is not acceptable in production.

v2 includes `evals/golden_set.json`: 30 question/expected-answer pairs covering all five modes. Each pair includes the input, the expected output characteristics (not exact text), and a rubric for scoring (0 to 2 scale: 0 = wrong or unhelpful, 1 = correct but off-voice, 2 = correct and on-brand).

`evals/run_evals.py` runs Scout against the golden set, scores each response against the rubric using a separate Claude call as the evaluator, and reports mode-level and overall pass rates.

This pattern (LLM-as-evaluator against a golden set) is the standard approach for conversational AI quality measurement. It is not perfect, but it is reproducible and much better than manual spot-checking.

**API layer**

v2 exposes Scout as a REST API via FastAPI:

- `POST /ask` — general query, mode inferred from input
- `POST /brief/{account_name}` — pre-call brief for a named account
- `POST /coach/{deal_id}` — deal coaching given a CRM deal ID
- `POST /shape` — deal shaping given scope notes

This enables Scout to be embedded in other tools: a Slack bot, a CRM sidebar, a mobile app for reps in the field.

**UI layer**

v2 includes a Chainlit interface with five tabs corresponding to the five modes. Chainlit is preferred over Streamlit for conversational AI applications because it handles multi-turn chat state natively, supports streaming responses, and produces a UI that looks like a chat product rather than a data dashboard.

---

## Key Design Decisions and Their Reasoning

**Why Claude Projects instead of LangChain or LangGraph**

LangChain and LangGraph are the default choices for agentic AI applications and they are the right choices when the application genuinely needs agent behavior: dynamic tool selection, multi-step reasoning, looping until a condition is met.

Scout v1 does not need any of that. It needs good retrieval, good prompting, and a well-structured knowledge base. Adding an agent framework to v1 would have introduced orchestration complexity, debugging overhead, and latency with no corresponding capability gain. The decision to use a Claude Project is not a concession to simplicity. It is the correct tool for the actual problem.

v2 uses LangGraph for the tool-use layer because at that point the application genuinely needs dynamic tool selection and multi-step reasoning.

**Why fixed-mode detection instead of a classifier**

Scout infers mode from the rep's opening rather than asking the rep to select a mode explicitly. This is a UX decision: reps should be able to talk to Scout the way they would talk to a colleague, not navigate a menu.

The mode detection lives in the system prompt as pattern matching against natural language signals. This is fragile at the margins (ambiguous inputs get misrouted occasionally) but it is fast to build, easy to debug, and good enough for v1. v2 would replace this with a lightweight intent classifier fine-tuned on representative inputs from each mode.

**Why the identity layer is constitutive rather than retrieved**

A simpler design would store the identity layer as a document and retrieve it when relevant. The problem is that voice and tone are not relevant in some interactions and irrelevant in others. They should color every response. That means they belong in the system prompt and in the writing style of the knowledge documents, not in a retrievable chunk.

The cost is that updating the identity layer requires touching multiple places. In v2, this is solved by making the identity layer an explicit document that feeds a system prompt template at build time, rather than being manually replicated.

**Why discrete knowledge documents rather than a single file**

Three reasons. First, Claude reasons more reliably over clearly bounded content than over undifferentiated text. Second, discrete files make the repo readable: a hiring manager can open `personas.md` and immediately understand what it is and why it exists. Third, it maps cleanly to the chunking strategy for v2 RAG without requiring a refactor.

---

## Known Limitations of v1

**No live data.** Scout's knowledge is static. A deal that closes or a practice area that pivots requires a manual knowledge base update.

**Context window is the retrieval mechanism.** At current knowledge base size this is fine. It would break at 5x the content.

**No evaluation.** There is no way to know systematically whether Scout has gotten better or worse after a knowledge base update.

**Single-user by design.** Claude Projects do not support shared state across users. In a real firm deployment, every rep would need their own Project with the same configuration, or v2's API layer would be required.

**Mode misrouting on ambiguous inputs.** Inputs that do not clearly signal a mode can result in Scout defaulting to pre-call prep behavior when deal coaching was intended. The mitigation is the one-clarifying-question guardrail in the system prompt.

---

## File Reference

```
scout/
├── README.md
├── docs/
│   ├── architecture.md          # This document
│   └── scout_architecture.png   # System diagram
├── knowledge/
│   ├── scout_foundation.md      # Master knowledge file
│   ├── company_profile.md
│   ├── practice_areas.md
│   ├── personas.md
│   ├── objection_bank.md
│   ├── deal_snapshots.md
│   └── deal_shaping_guide.md
├── prompts/
│   └── system_prompt.md
└── .env.example
```


---

## Security & Data Privacy

Security and data privacy considerations for Scout, including CRM data handling, Anthropic API data retention, prompt injection risk, authentication, and a pre-deployment checklist, are documented in [`SECURITY.md`](../security.md). If you are evaluating Scout for internal deployment, share that document with your information security lead before connecting Scout to a production CRM.
