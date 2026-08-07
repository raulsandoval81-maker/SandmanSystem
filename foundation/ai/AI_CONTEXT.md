cat > foundation/ai/AI_CONTEXT.md <<'EOF'
# Sandman AI Context

Purpose:

This document exists specifically for AI assistants working on Sandman System.

It preserves architectural context, development philosophy, and project expectations across long-running development.

This document is NOT user documentation.

It is the AI operating context.

---

# PRIMARY OBJECTIVE

Help build Sandman System without creating architectural drift.

Protect doctrine before adding features.

When uncertain:

VERIFY.

Never invent architecture.

---

# DEVELOPMENT PHILOSOPHY

Always prefer:

Understand

↓

Verify

↓

Extend

↓

Build

Instead of:

Guess

↓

Replace

↓

Rebuild

---

# GOLDEN RULES

1.

Inspect existing files before proposing changes.

Never assume implementation.

---

2.

Do not redesign working architecture because one page can improve.

Improve within the existing system whenever practical.

---

3.

Every page should have one primary responsibility.

Avoid duplicate workflows.

---

4.

Coach-guided workflow is intentional.

Do not bypass coach authority.

---

5.

Public users do not control operational workflow.

Coach remains responsible.

---

6.

Proposal always precedes Stripe.

Stripe is payment execution.

Proposal is business agreement.

---

7.

Enrollment follows Proposal.

Enrollment is the coach-guided closing process.

Enrollment is not Intake.

---

8.

Intake is operational onboarding.

Waiver belongs inside Intake.

---

9.

Family billing.

Independent athlete progression.

Never merge those concepts.

---

10.

Do not duplicate business logic.

If a source of truth already exists:

Reuse it.

---

# CURRENT CONNECT PIPELINE

Interest

↓

Coach Review

↓

Admissions Request

↓

Admissions Appointment

↓

Prospect Builder

↓

Proposal

↓

Enrollment

---

# CURRENT ENROLLMENT DIRECTION

Status:

UNDER REVIEW

Current intended order:

House Standards

↓

Stripe

↓

Athlete / Family Pledge

↓

Coach-controlled Intake

↓

Coach Review

↓

Mint

This sequence may evolve.

Do not move stages casually.

---

# COACH FIRST

Sandman is coach-led.

The software assists the coach.

The software does not replace the coach.

When choosing between:

automation

or

coach authority

prefer coach authority unless doctrine explicitly states otherwise.

---

# VERIFY BEFORE BUILDING

Before proposing architecture:

Inspect:

• existing folders

• existing files

• current pipeline

• current collections

• current routing

Never invent missing implementation.

---

# ARCHITECTURE RULE

If an existing stage already owns the responsibility,

extend it.

Do not create another stage.

---

# WHEN THE USER SAYS

"Refresh."

Read:

1.

START_HERE

2.

CORE_DOCTRINE

3.

AI_CONTEXT

4.

CURRENT_STATUS

Then continue.

---

# WHEN YOU START DRIFTING

Common warning signs:

Creating duplicate systems

Moving Stripe earlier

Bypassing Proposal

Skipping Prospect Builder

Combining Admin and Management

Allowing Parent to control operational workflow

Creating unnecessary new pages

Inventing implementation

Ignoring existing files

When these occur:

Stop.

Inspect.

Return to doctrine.

---

# RESPONSE STYLE

Be direct.

Be practical.

Architecture before implementation.

Verify before suggesting.

Prefer extending existing work over replacing it.

Avoid unnecessary complexity.

Do not mistake temporary implementation for long-term architecture.

---

# SANDMAN DEVELOPMENT PRINCIPLE

The goal is not simply working software.

The goal is a repeatable operating system that preserves Sandman doctrine while allowing the organization to grow.
EOF