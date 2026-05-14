# Scout — AI Sales Assistant for B2B Services Firms

> *Built on Claude. Inspired by a real internal tool. Fictional company, real architecture thinking.*

---

## What This Is

Scout is an AI-powered sales assistant designed for relationship-led B2B services firms: consultancies, professional services, advisory practices. It helps sellers prepare for client conversations, handle objections, coach active deals, shape engagements into proposals, and get up to speed on how the firm actually talks.

This repo demonstrates the architecture, knowledge design, and product thinking behind a Claude-powered internal sales tool. It uses a fictional consulting firm called **BTO Group**. The name is intentionally on the nose; a consulting industry inside-joke. If it's not immediately obvious, BTO is a wink at the consulting habit of taking a focused business problem and expanding it into a sweeping, enterprise-wide transformation effort. Then you'll know what "BTO" stands for.

**Scout is not a toy demo.** The goal is a forkable starting point someone could adapt to a real firm in a day.

---

## Demo

> *GIF or screenshot goes here. See the repo wiki for recording instructions.*

---

## What Problem It Solves

B2B services firms have a persistent sales enablement gap. Reps, especially those ramping, carry too much in their heads and get inconsistent support from managers who are themselves selling. The result:

- New sellers take 3 to 6 months to internalize how the firm talks, positions itself, and closes
- Pre-call prep happens in 10 minutes on Google instead of 30 minutes with the right context
- Objection handling is inconsistent across the team: some reps fold on price, others don't
- Deal coaching is reactive and calendar-dependent, not available when the rep needs it

Scout addresses all four by putting structured firm knowledge into a conversational AI that's always available and always on-brand.

---

## Five Modes

Scout operates across five modes, inferred from how the rep opens the conversation:

| Mode | Trigger | What Scout delivers |
|---|---|---|
| **Identity & voice** | "How do we talk about..." | Brand voice guidance, positioning language, what to say and what to avoid |
| **Pre-call prep** | "I have a call tomorrow with..." | Buyer context, likely concerns, suggested questions, one thing to avoid |
| **Objection handling** | "They keep saying..." | Direct response frame that sounds like a real person, not a brochure |
| **Deal coaching** | "Here's where the deal stands..." | Honest deal health read, what's missing, single most important next action |
| **Deal shaping** | "We're moving toward a proposal..." | Scope structure, SOW framing, pricing logic, procurement landmine flags |

The **BTO identity layer** underlies all five modes. Every Scout response reflects the firm's voice, not just its knowledge.

---

## Architecture

```
Rep input (free-form)
        |
        v
  Mode detection (inferred from opening)
        |
        v
+-----------------------------------------------------------+
|                 Five Scout modes (Claude API)             |
|  Voice | Pre-call | Objection | Coaching | Shaping        |
+-----------------------------------------------------------+
        |
        v
+-----------------------------------------------------------+
|                   BTO identity layer                      |
|        Voice · tone · language rules · firm POV           |
|                Underlies every response                   |
+-----------------------------------------------------------+
        |
        v
+------------------------------------------------------------------+
|                       Knowledge base                             |
|  Practice areas | Personas | Deal snapshots | Objections + SOW  |
+------------------------------------------------------------------+
        |
        v
  Claude API (claude-sonnet-4 via Claude Project)
```

**Implementation approach:** Scout v1 is built as a Claude Project. The system prompt is the agent, the knowledge base is loaded as project documents, and the interface is the Claude chat UI. This is a deliberate architectural choice: it prioritizes demonstrating knowledge design and product thinking over infrastructure complexity. See [`docs/architecture.md`](docs/architecture.md) for the v2 agent architecture (RAG pipeline, tool use, eval harness) and the reasoning behind the v1 tradeoffs.

---

## Repo Structure

```
scout/
├── README.md
├── docs/
│   ├── architecture.md          # Design decisions, tradeoffs, v2 roadmap
│   └── scout_architecture.png   # System diagram
├── knowledge/
│   ├── scout_foundation.md      # Master knowledge file (load into Claude Project)
│   ├── company_profile.md       # BTO Group: who they are, how they sell
│   ├── practice_areas.md        # 4 offerings: triggers, POV, objections
│   ├── personas.md              # Buyer archetypes: CFO, VP/COO, blocker
│   ├── objection_bank.md        # Common objections + response frames
│   ├── deal_snapshots.md        # 3 sample deals across modes
│   └── deal_shaping_guide.md    # SOW structure, pricing, procurement
├── prompts/
│   └── system_prompt.md         # Scout's full system prompt, versioned here
└── .env.example
```

---

## Setup in 3 Steps

**Prerequisites:** A Claude account (free or Pro) with access to Claude Projects.

**Step 1 — Create a Claude Project**

In Claude.ai, create a new Project called "Scout — BTO Group."

**Step 2 — Load the system prompt**

Copy the contents of `prompts/system_prompt.md` into the Project Instructions field.

**Step 3 — Load the knowledge base**

Upload `knowledge/scout_foundation.md` as a Project document. Optionally upload the individual files in `knowledge/` for more granular context.

Start a conversation. Try:
> *"I have a call tomorrow with the new CDO of a regional healthcare system. She's 90 days into the role and I know the last digital initiative stalled under her predecessor."*

Scout should return a structured pre-call brief without prompting.

---

## Example Conversations

**Pre-call prep**
```
Rep:    I have a first meeting tomorrow with the CFO of a $2B industrial
        manufacturer. PE-backed, new CFO 6 months in. We were referred by
        their operating partner.

Scout:  Here's how I'd frame the prep...
        [Buyer context, likely priorities, suggested opening questions,
         relevant BTO practice area, one thing to avoid]
```

**Objection handling**
```
Rep:    The VP keeps coming back to price. They said we're "significantly
        more expensive" than the Big 4 proposal they have on the table.

Scout:  First, that framing is worth unpacking before you respond...
        [Honest read of the objection, direct response frame,
         what to acknowledge, what to push back on]
```

**Deal coaching**
```
Rep:    We submitted a proposal 14 days ago. Champion has gone quiet.
        We know there's a Big 4 firm in the mix and the CFO only gave
        us 30 minutes when we presented.

Scout:  A few things stand out here...
        [Deal health read, specific risks, single most important next action]
```

**Deal shaping**
```
Rep:    We have a verbal on an M&A integration engagement. PE client,
        close is in 11 weeks. They're asking for "full integration support"
        but we haven't scoped it yet. ACV target is around $600K.

Scout:  Before you write a number down, let's scope this...
        [Scope structure, SOW framing, what to pin down before pricing,
         PE-specific procurement flags]
```

---

## What This Demonstrates

This project was built to show specific things. Here's what to look for:

**Knowledge architecture over prompt engineering.** The interesting design decisions are in how the knowledge base is structured: practice areas with triggers and objection frames, persona cards with buying psychology, a deal shaping guide with commercial and legal specificity. The system prompt is the scaffolding; the knowledge is the substance.

**Product thinking about AI fit.** Scout's five modes reflect a deliberate answer to the question: what does AI actually do better than a manager or a deck? Available on demand (not calendar-dependent), consistent across reps, and able to hold the full context of a deal while helping the rep think. The mode design reflects that.

**Identity layer as architecture.** Most sales AI demos treat voice and tone as a footnote. Here it's a first-class layer: woven into the system prompt and queryable as its own mode. A ramping seller needs to internalize how the firm talks, not just what it sells.

**Honest scope.** Scout v1 is a Claude Project, not a full agentic system. That's a deliberate tradeoff documented in `architecture.md`. The v2 design (RAG pipeline, tool use, eval harness) is fully specced. The decision to build v1 first reflects how real product development works.

---

## What v2 Would Add

The v1 architecture demonstrates the what and why of Scout. A production v2 would add:

- **RAG pipeline:** vector store (LanceDB or Chroma) indexing the knowledge base, enabling retrieval over larger corpora than a Claude Project context window supports
- **Tool use:** structured tools for `get_account_brief`, `search_objection_bank`, `analyze_deal`, `generate_sow_outline` with clean input/output schemas
- **CRM integration:** read access to deal data (HubSpot or Salesforce) so deal coaching is grounded in real pipeline state, not rep-described context
- **Eval harness:** a golden dataset of 25 to 30 question/expected-answer pairs and a scoring script to measure Scout's reliability across modes
- **API + UI layer:** FastAPI endpoints and a Streamlit or Chainlit interface with mode-specific tabs

The full v2 architecture design is in [`docs/architecture.md`](docs/architecture.md).

---

## About

Built by **Bryon Scharenberg**: strategy and transformation background, currently building at the intersection of AI and professional services.

[LinkedIn](https://www.linkedin.com/in/scharenberg/) · [GitHub](https://github.com/scharenberg)

---

## License

MIT. Fork it, adapt it, use it. If you build something with it, I'd genuinely like to hear about it.
