# Sandman XP Domain Boundaries

Status: architecture boundary for Phases 1–5 and preparation for future work. This note does not create a migration, conversion rate, or new Firebase write path.

## Active Rank XP

`athlete.xp` is the sole authoritative balance for the athlete's current Journey rank. It drives active-rank stripes, testing eligibility, and promotion readiness. Promotion intentionally resets it to zero.

Active Rank XP must never be reconstructed from historical logs, receipts, monthly counters, source-reporting buckets, Lifetime XP, or Challenge XP.

## Lifetime XP

Lifetime XP is the permanent cumulative career record stored canonically in `athlete.lifetimeXp`. It never resets at promotion and may eventually support profile, game, or unlock features. It must never drive or reconstruct Active Rank XP.

Every successful positive authoritative award that actually increases Active Rank XP adds the same actual, post-cap delta to Lifetime XP in the same Firestore transaction. Missing `lifetimeXp` begins at zero for new accumulation. Normal runtime must not backfill it from aliases, buckets, logs, or monthly data. Active Rank deductions, including inactivity decay, do not reduce Lifetime XP.

Existing reader aliases are `lifetimeXp`, `xpLifetime`, and `totalLifetimeXp`; only `lifetimeXp` is an authoritative write target. `LifeXP` is not an implemented field or currency. The older names `totalXP` and `xpTotal` are ambiguous legacy terms and must not be treated as Lifetime XP without explicit provenance.

## Challenge XP

Challenge XP is a future game/outside-effort currency. No Challenge XP balance, award engine, or conversion rule is currently implemented. Existing `trainingChallenges` documents are assignments/focus prompts, not Challenge XP transactions.

A future approved rule may convert Challenge XP into Lifetime XP. No conversion rate is established here.

The following paths are forbidden:

- Challenge XP to Active Rank XP
- Challenge XP to Strength XP
- Challenge XP to Honor XP
- Lifetime XP to Active Rank XP

## Strength and Honor

For Foundry 8, approved Strength and Honor awards contribute to the single Active Rank XP bar under the Phase 1 caps. Their reporting buckets are not independent promotable ranks.

For Foundry 4 and older programs, Strength XP and Honor XP retain their existing separate bucket identity and approved behavior. They are not Challenge XP and are not flattened into the Journey rank bar.

## Storage and reader rules

- `athlete.xp`: Active Rank XP only.
- `xpStrength` / `xpHonor`: program-specific reporting or separate-lane balances; never Challenge XP.
- `xpDaily`, `xpArena`, `xpFightIQ`, monthly state, logs, and receipts: history, reporting, or safeguards; never reconstruction inputs for Active Rank XP.
- Lifetime fields must not fall back to `athlete.xp` when labeled as lifetime progress.
- Legacy `athletesXP.totalXP` and cumulative-ladder utilities require explicit modernization before reuse; their names do not establish domain authority.

The pure server policy is `functions/src/policy/xpDomainPolicy.ts`.
