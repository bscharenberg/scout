# Security & Data Privacy

This document covers the security and data privacy considerations for Scout, with particular attention to the v2 architecture where Scout is connected to a CRM and reading live deal and account data. It is written to be shared with an information security lead evaluating Scout for internal deployment.

---

## v1 vs v2 Risk Profile

Scout v1 is a Claude Project with a static, fictional knowledge base. There is no real customer data, no CRM connection, and no custom code. The security surface is limited to whatever a user types into the Claude chat interface. The considerations in this document are primarily forward-looking to v2.

v2 changes the risk profile materially. Once Scout has read access to a real CRM, it is handling sensitive commercial data: client names, deal values, pipeline stage, contact information, and potentially notes that contain confidential client information. That requires deliberate design, not just default behavior.

---

## Data Classification

Before deployment, the following data types that Scout v2 may access or process should be classified according to your firm's data classification policy:

| Data type | Examples | Likely classification |
|---|---|---|
| Deal metadata | Stage, ACV, close date, owner | Internal / Confidential |
| Account information | Company name, industry, size | Internal / Confidential |
| Contact information | Names, titles, email addresses | Internal / Confidential |
| Engagement notes | Call notes, email summaries, rep observations | Confidential |
| Client deliverable references | Project names, scope summaries in CRM | Confidential / Client Confidential |
| Rep-typed conversation content | What a rep types into Scout during a session | Internal / Confidential |

The client confidential category warrants specific attention. Consulting firm CRM records often contain information that is confidential not just to the firm but under client contracts. Before connecting Scout to a CRM, confirm with your legal team whether sending that data to a third-party API (Anthropic) is permissible under your standard client engagement terms.

---

## Anthropic API Data Handling

Scout v2 sends data to the Anthropic API to generate responses. The relevant questions for your infosec lead:

**Is data used to train Anthropic's models?**
By default, API usage is not used to train Anthropic models. This is distinct from Claude.ai consumer product usage. Confirm the current policy at [https://www.anthropic.com/privacy](https://www.anthropic.com/privacy) and in your API terms of service, as policies may be updated.

**Is data retained by Anthropic after a request?**
Standard API calls are not retained beyond the immediate request by default. For enterprise deployments requiring a contractual zero-retention guarantee, Anthropic offers zero data retention (ZDR) agreements. If Scout will process client confidential information, a ZDR agreement should be evaluated before production deployment.

**Is data transmitted securely?**
All Anthropic API calls use TLS 1.2 or higher in transit. Confirm your deployment does not log raw request payloads containing sensitive data in application logs.

**Where is data processed?**
Anthropic processes data in the United States. If your firm operates under data residency requirements (GDPR, UK GDPR, or client contractual requirements), this needs to be evaluated before deployment.

---

## CRM Integration Security

The v2 CRM integration introduces the highest-risk surface in the Scout architecture. The following principles should govern its design and implementation.

**Principle of least privilege**

Scout should be granted the minimum CRM permissions required to function. In practice this means:

- Read-only access (no write, update, or delete permissions)
- Scoped to specific CRM objects: deals/opportunities, accounts, contacts
- No access to billing records, admin settings, user management, or financial reporting objects
- Explicit exclusion of any objects containing compensation data, HR data, or credentials

Document the exact OAuth scopes requested and have them reviewed before deployment.

**User-scoped data access**

Scout should not use a single shared service account to query CRM data. A single service account means every user can query data for every deal, regardless of whether they own it or have legitimate access.

The correct pattern: Scout authenticates as the individual rep making the request, inheriting their existing CRM permissions. A rep can only ask Scout about deals and accounts they already have access to in the CRM. This is not an additional access control layer to build. It is using the access controls that already exist.

**OAuth token handling**

CRM OAuth tokens should be stored in a secrets manager (AWS Secrets Manager, HashiCorp Vault, or equivalent), not in environment variables or application config files. Tokens should be rotated on the schedule required by your CRM provider. Revocation should be possible without redeploying the application.

**Audit logging**

Every CRM data access made by Scout should be logged: which user, which deal or account was queried, timestamp, and which Scout mode triggered the query. These logs should be retained according to your firm's audit log retention policy and be accessible to your infosec team. This is both a security control and a compliance requirement in most enterprise environments.

---

## Conversation Data

When a rep uses Scout, they type sensitive information into the chat interface. A rep coaching a deal might type the client's name, the deal value, what was said in the last meeting, and their read on the stakeholder dynamics. That is sensitive data.

**What gets sent to the API**

Every message in a Scout conversation, including the full conversation history maintained for context, is sent to the Anthropic API with each request. This is how conversational AI context works. Reps should be informed of this and it should be reflected in your internal acceptable use policy for Scout.

**Conversation logging**

If your v2 deployment logs conversation history for debugging or improvement purposes, those logs contain the sensitive content described above. Log storage should be access-controlled, encrypted at rest, and subject to a defined retention and deletion policy. Do not log conversations to general-purpose application log aggregators without appropriate access controls.

**No PII in prompts where avoidable**

Where Scout can accomplish its task without requiring a rep to include specific client names or contact details, the system prompt should encourage that. For example, deal coaching based on deal dynamics ("the CFO went quiet after the proposal") is often just as useful as deal coaching that includes the client's actual name. This reduces the sensitivity of what gets transmitted.

---

## Prompt Injection

Prompt injection is an attack where malicious instructions are embedded in content that Scout reads, causing it to behave in unintended ways.

In v1 and v2 as currently scoped, this risk is low because Scout only reads from controlled sources: its knowledge base and rep-typed input. The attack surface is limited.

The risk increases if future Scout capabilities include reading external content: email threads, call transcripts from a third-party provider, web pages, or documents uploaded by users. If those capabilities are added, input from those sources should be treated as untrusted and handled with appropriate guardrails in the system prompt and application layer.

Document this as a risk to reassess whenever Scout's input sources expand.

---

## Authentication and Access Control

Scout v2 requires authentication at the application layer: only authorized firm employees should be able to use it.

Recommended approach: integrate with your firm's existing identity provider (Okta, Azure AD, Google Workspace) via SAML or OIDC. Do not build a separate credential store. This gives you:

- Single sign-on for reps (no new password to manage)
- Centralized access revocation (when someone leaves the firm, their Scout access is revoked with their firm credentials)
- Audit trail of who authenticated when

Role-based access control should be considered if not all employees should have access to all Scout modes. For example, access to deal coaching and deal shaping modes might be restricted to active BD team members.

---

## Incident Response

Before production deployment, define the response procedure for the following scenarios:

**CRM token compromise:** Revoke the OAuth token immediately, audit CRM access logs for anomalous queries during the exposure window, rotate all related credentials, notify affected parties per your incident response policy.

**Conversation log exposure:** Assess what data was exposed, identify affected deals and clients, notify per your data breach policy and any applicable regulatory requirements.

**Prompt injection confirmed:** Take Scout offline, assess whether the injected instructions caused any unintended actions, patch the vulnerable input pathway before redeployment.

---

## Pre-Deployment Checklist

Before connecting Scout v2 to a production CRM and deploying to internal users:

- [ ] Legal review of client engagement terms for permissibility of third-party API processing of CRM data
- [ ] Anthropic API data handling policy reviewed and acceptable for your data classification requirements
- [ ] ZDR agreement in place if client confidential data will be processed (evaluate based on legal review above)
- [ ] CRM OAuth scopes documented, read-only confirmed, reviewed by infosec
- [ ] User-scoped CRM access implemented (not shared service account)
- [ ] OAuth tokens in secrets manager, not in config files
- [ ] Audit logging implemented for all CRM queries
- [ ] Conversation log storage access-controlled, encrypted at rest, retention policy defined
- [ ] Authentication via firm identity provider implemented
- [ ] Acceptable use policy for Scout drafted and communicated to users
- [ ] Incident response procedures defined for the scenarios above
