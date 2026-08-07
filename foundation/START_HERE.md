cat > foundation/START_HERE.md <<'EOF'
# Sandman Foundation

**Purpose:** Preserve the doctrine, architecture, operating knowledge, and development context of Sandman System so the platform does not depend on any one person's memory.

> Code changes. Foundations endure.

---

## Read This First

Before making architectural or development decisions, read the Foundation in this order:

1. `constitution/00-CORE-DOCTRINE.md`
2. `ai/AI_CONTEXT.md`
3. `ai/CURRENT_STATUS.md`
4. The relevant file under `architecture/`
5. `ai/DECISION_LOG.md` when prior decisions may affect the work

Do not begin a major redesign from memory alone.

When implementation and Foundation documentation appear to conflict:

1. Inspect the current implementation.
2. Determine whether the Foundation is outdated or the implementation has drifted.
3. Do not silently choose one.
4. Resolve the conflict before changing architecture.

---

# What the Foundation Contains

## Constitution

`foundation/constitution/`

Defines what Sandman is, how authority works, and the principles that should rarely change.

This is the highest-level doctrine.

Examples:

- Mission
- Vision
- User hierarchy
- Operating principles
- Development principles

Changes here may affect the entire platform.

---

## Architecture

`foundation/architecture/`

Defines how Sandman System is structured.

Examples:

- Connect
- Admissions
- Prospect Builder
- Enrollment
- Billing
- Intake
- Management
- XP Engine
- Database
- File structure

Architecture should implement the Constitution.

---

## Business

`foundation/business/`

Defines repeatable operating models used by coaches and the organization.

Examples:

- Sales playbook
- Coach enrollment process
- House Standards
- Athlete and parent pledges
- Pricing
- Promotions

These documents explain how Sandman operates beyond the software itself.

---

## AI Context

`foundation/ai/`

Exists specifically to preserve development continuity across AI sessions, developers, and long-running projects.

Important files:

- `SESSION_START.md`
- `AI_CONTEXT.md`
- `CURRENT_STATUS.md`
- `ACTIVE_PROJECT.md`
- `DECISION_LOG.md`
- `DEVELOPMENT_RULES.md`
- `VERIFY_FIRST.md`

If an AI assistant appears to be drifting from established Sandman architecture, return to these files before continuing.

---

## Standards

`foundation/standards/`

Defines implementation standards for:

- HTML
- CSS
- JavaScript
- Firebase
- UI
- Brand
- Naming

These standards should reduce unnecessary variation across the platform.

---

## Reference

`foundation/reference/`

Provides quick operational reference for:

- Firestore collections
- Routes
- Terminal commands
- Resources
- Glossary

Reference documents explain what exists. They do not override doctrine.

---

# Sandman System Authority Model

The platform distinguishes governance from operations.

SYSTEM ADMIN
      ↓
MANAGEMENT
      ↓
COACH
      ↓
PARENT / ADULT ATHLETE
      ↓
ATHLETE