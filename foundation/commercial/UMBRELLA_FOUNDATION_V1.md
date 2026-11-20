# Sandman Systems Umbrella — Foundation Sprint 01

Status: **DRAFT / PROPOSED**, not an amendment to locked Academy doctrine.  
Scope: product architecture, organization boundaries, entitlements and acceptance contracts.  
Source of authority: `foundation/architecture/PLATFORM.md`, `foundation/architecture/DATABASE.md`, `foundation/constitution/03-HIERARCHY.md` (all LOCKED).  

## Mission
Build an Academy-first Commercial operating platform without rewriting the Academy, merging customer databases, or subordinating all independent products to one runtime.

**Operating proof is not commercial proof.** Sandman Academy is used by its owner in a real gym. Independent-organization onboarding, tenant isolation, billing, product packaging, and full-loop commercial operation must be separately demonstrated before sale.

## Three distinct concepts
1. **Sandman Systems (umbrella)** owns portfolio governance, product/capability catalog, compatibility contracts, and eventually platform identity/entitlements. It does **not** automatically own Academy operational records or every tool's runtime.
2. **Sandman Academy (reference operator)** owns its existing production customer records, payments, workflows, and deployment. Existing production is protected and unchanged by this sprint.
3. **Sandman Commercial (customer offering)** is a planned independent product assembled from reviewed, sanitized, verified capabilities. The standalone `SandmanCommercial` repository currently has no imported implementation. No raw production clone is authorized.

Other products (WTM, Combat Trainer, CornermanAI, FuelAI, FightRoom, Practice Clipboard, Combat Games, GhostMediaAI) may be sold independently and may later expose optional adapters or tier-eligible access. **Grant Factory AI** is a separate market/business lane, not a mandatory combat-platform module.

## Contract: organizational hierarchy
Preserve: SYSTEM ADMIN → ORGANIZATION → ACADEMY → LOCATION → MANAGEMENT → COACH → PARENT / ADULT ATHLETE → ATHLETE.

An organization is the **commercial billing and tenancy principal**. An organization may hold multiple academies, each with multiple locations; programs are configured within the appropriate academy/location scope. Personnel membership and scope-based roles must be explicit; a person may belong to multiple organizations without data crossing organization boundaries.

Commercial tenant operations are always scoped by organization identity on the server, not inferred from a URL, client-side menu, or payment tier. Ownership and access rules must be enforced at API, storage, background job, and audit layers. Never assume a universal login exists today.

## Product, capability and entitlement contracts
- **Product**: a independently identifiable application/experience with an owner, release state, data boundary, and integration type.
- **Capability**: an actionable permission/function, with one owning domain and explicit dependencies, potentially packaged in more than one tier.
- **Tier**: proposed customer packaging (Core, Plus, Pro). Pricing and final inclusion are deliberately **unapproved** until scope and customer validation.
- **Entitlement**: explicit grant of a capability to an organization, with provenance, term, quantity limits, and auditable changes.
- **Adapter**: optional versioned integration between products. Failure of one standalone tool must not disable essential Academy/Commercial operation.

Do not treat a product being registered as proof of deployment, safety, feature readiness, subscription eligibility, or integration. The inventory is intentionally conservative.

### Proposed capability tiers (not commitments)
| Tier | Proposed value | Conditions |
|---|---|---|
| Core | Organization setup, program/roster/schedule/attendance/operations | Verify each full workflow and essential privacy/access features |
| Plus | Core plus Coach/Parent/Athlete experiences, curriculum, XP/progression | Verify per-organization permissions and content licensing |
| Pro | Plus plus advanced reporting and explicitly verified optional tools | Never promise all independent apps are integrated |

Security, basic access controls, and legally required record handling cannot be withheld as paid upgrades. Standalone products may be sold separately; offering them via Commercial requires independently verified licensing and adapters.

## Minimal organization model (proposal)
- `organization`: opaque id, display name, lifecycle state, owner membership references, permitted products.
- `academy`: opaque id, organizationId, name, organizational policy profile.
- `location`: opaque id, academyId, site name, local settings.
- `program`: opaque id, academyId, optional locationIds, age/program classification, enabled disciplines.
- `membership`: userId, organizationId, role, scope type/id, grant authority, status.
- `entitlement`: organizationId, capabilityId, source product/tier/add-on, effective dates, status and audit reference.

No customer or payment data belongs in a shared global product registry. Product registry describes products and capabilities only.

## Functional release gates
1. Inventory Academy full loop (admissions → proposal → payment/reconciliation → intake → activation → coach → athlete/parent → progression → renewal); mark each **verified**, **partial** or **blocked**, backed by evidence.
2. Independently review the sanitized Commercial source transfer and security verification; do not assume a prior local bundle is sufficient authorization to import.
3. Use two synthetic organizations with overlapping usernames and deliberately conflicting identifiers; verify zero cross-tenant reads/writes, records, logs, exports, video or notifications.
4. Test organization creation → academy → location → program → role assignment → permitted content → athlete progression and parent visibility.
5. Test tier grant, upgrade, downgrade and expiration server-side; deny access if entitlement invalid, without deleting customer data.
6. Confirm independent organization billing, privacy notices, consent boundaries, support and rollback evidence before any real customer onboarding.
7. Pilot with one consenting independent academy after synthetic and security gates pass.

## Sprint 01 deliverables
- [x] Non-executable umbrella doctrine draft (this document).
- [x] Machine-readable **proposal** catalog of products and capabilities (`product-registry.v1.json`).
- [ ] Verify catalog facts and component ownership with Academy owners/maintainers.
- [ ] Approve initial entitlement names and tier membership.
- [ ] Design/test organization isolation implementation in an **independent** Commercial environment.
- [ ] Adopt governance/versioning process for optional tools.

### Change controls
This branch must remain documentation/data only. No change to Firebase Hosting, Cloud Functions, Firestore rules, customer records, Stripe, private secrets, Railway, or live deployments. Draft PR review is mandatory; no automatic merging. Any executable implementation requires a separate reviewed engineering release.
