# Sandman Development Principles

STATUS

LOCKED

Purpose

These principles define how Sandman System should be designed, developed, maintained, and expanded.

Every developer, AI assistant, and future contributor should understand these principles before modifying the platform.

---

# Principle 1

Foundation Before Code

Every significant architectural change should begin in Foundation before implementation.

If doctrine changes, update Foundation first.

---

# Principle 2

Architecture Before Features

Do not add features simply because they are useful.

Determine where the responsibility belongs.

Then build.

---

# Principle 3

Verify Before Building

Never assume.

Inspect:

• folders

• files

• routing

• collections

• existing workflows

Understand before modifying.

---

# Principle 4

One Responsibility

Every page should have one primary responsibility.

Every collection should have one primary responsibility.

Every function should have one primary responsibility.

---

# Principle 5

Extend Existing Systems

Before creating:

a page

a collection

a function

a folder

ask:

"Does Sandman already have a system responsible for this?"

If yes:

extend it.

---

# Principle 6

Avoid Duplicate Logic

Business logic should exist once.

Presentation may exist many times.

Examples:

Pricing

Programs

Locations

Rank definitions

Authority

Pipeline state

---

# Principle 7

Respect Coach Authority

Coach-guided workflows are intentional.

Do not bypass coach approval simply because automation is possible.

---

# Principle 8

Progress Through Stages

Sandman is built around stages.

Each stage owns its responsibility.

Avoid skipping stages.

Avoid merging unrelated stages.

---

# Principle 9

Simple Beats Clever

Future coaches and developers should understand the system quickly.

Choose clarity over novelty.

---

# Principle 10

Protect Existing Work

Before replacing a system:

Understand why it exists.

Preserve what works.

Improve weaknesses.

Do not rewrite simply because another design is possible.

---

# Principle 11

Document Major Decisions

If architecture changes:

Update:

Foundation

↓

Architecture

↓

Implementation

↓

Decision Log

---

# Principle 12

Build For Tomorrow

Every feature should ask:

Will this still make sense after:

100 athletes?

500 athletes?

Multiple locations?

Partner academies?

Franchise growth?

If not:

Improve the design.

---

# Principle 13

Finish Systems

Complete systems.

Avoid collecting half-finished ideas.

Working systems outperform unfinished perfection.

---

# Principle 14

Human Relationships Come First

Technology supports relationships.

Technology should never replace coaching, trust, or leadership.

---

# Principle 15

Leave Sandman Better

Every contribution should improve:

clarity

consistency

maintainability

coach experience

family experience

organization

