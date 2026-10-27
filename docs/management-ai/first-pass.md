# Sandman Management AI — foundation pass 1 (October 26, 2026)

## Purpose

Prepare a **safe, additive** contact/conversation integration for AI-assisted admissions.
This is **not** an autonomous AI release. Nothing in this pass sends messages, connects
Gmail, starts recurring jobs, changes Firestore documents, or alters production workflows.

## Existing source-of-truth systems (do not duplicate)

| System | Existing responsibility |
| --- | --- |
| `general_messages` | Public Message Us submissions, admin triage, outbound response history |
| `interest_leads` | Admissions interest and lead status |
| `admissions_appointments` | Scheduling and admission appointments |
| Gatekeeper | Appointment confirmation and duplicate-send protection |
| `management_intelligence` | Historical closed-message archive (not an AI engine) |
| Resend | Existing outbound Management email service; replies point to `joinsandmancombat@gmail.com` |

GhostMediaAI is a **separate** repository and should remain a separately deployable
marketing/content application; a bridge must be authorized explicitly rather than
sharing browser session cookies or keys.

## Implemented in this PR

- Pure canonicalization of email and US phone contact hints
- Conservative cross-record linking assessment for human review only
- Unit tests for ambiguous inputs and family-safe identity behavior
- No runtime import or behavior changes in the existing application

## Next implementation gates (separate PRs)

1. **Data contract:** Add a versioned, read-only contact lookup interface under
   Management permissions, with explicit academy/location scoping and audit logs.
   Never auto-merge records based only on email, phone, or household name.
2. **Conversation events:** Define message identity, inbound/outbound event IDs,
   channel, timestamp, status and reply correlation. Preserve original records
   and consent source; ensure duplicate delivery is idempotent.
3. **Inbound email:** Verify authorized Gmail mailbox access and reply ingestion,
   including thread identity and opt-outs. Existing Resend `replyTo` does not
   establish Gmail-to-Management synchronization.
4. **AI suggestions:** Run server-side analysis using minimized, scoped data.
   Suggestions and draft responses require Management review at first.
5. **Follow-up engine:** Schedule only consented contact, stop on reply,
   enrollment, decline or opt-out; no direct youth prospect messaging.
6. **Appointments:** Offer only verified availability; write through existing
   appointment authorization pathways and preserve Gatekeeper confirmations.
7. **Ghost Media bridge:** Connect approved campaign-content requests through
   service-level authentication, no broad access to family or athlete data.

## Explicit non-goals

- No auto-replies or AI authority to send, book, price or enroll.
- No replacement CRM or duplicate source-of-truth database.
- No collection of children's personal data for marketing.
- No production deployment in this PR.

## Verification

Run `node --test tests/functions/management-ai-contact-identity.test.mjs`
from repository root with development dependencies installed. Integration,
security, and production tests are still required before enabling any agent.
