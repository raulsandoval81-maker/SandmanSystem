# Sandman Architecture Map

This document defines ownership.

Before adding a new feature, answer one question:

> Which system owns this responsibility?

If that answer is unclear, the architecture is not ready.

# Sandman System Architecture Map (Working Doctrine)

**Status:** Draft v1
**Purpose:** Separate knowledge from software so every component has one clear responsibility.

---

# Core Principle

> **The Vault owns knowledge.**
>
> **The App delivers experiences.**

Everything else supports one of those two jobs.

---

# 1. VAULT

Purpose:

The permanent knowledge repository.

This is Sandman's intellectual property.

```
Vault
│
├── Combat
├── Strength
├── Honor
├── Nutrition
├── Recovery
└── Future Pillars
```

The Vault contains:

- Courses
- Segments
- Lessons
- Missions
- Libraries
- Metadata
- Schemas

The Vault should never care about:

- Firestore
- XP
- Authentication
- UI
- Coach review
- Athlete progress

It simply defines **what should be taught.**

---

# 2. ARSENAL

Purpose:

The athlete's encyclopedia.

The Arsenal organizes everything an athlete has unlocked.

```
Arsenal
│
├── Combat
├── Strength
├── Honor
└── Future Systems
```

The Arsenal answers:

> What can I access?

Not

> What lesson comes next?

---

# 3. ATHLETE LANES

Purpose:

Deliver today's assignment.

```
Athlete Lane

↓

Current Lesson

↓

Submission
```

The lane should know:

- Current lesson
- Previous completion
- Unlock status
- Submission status

It should NOT own curriculum.

It simply displays it.

---

# 4. COACH LANES

Purpose:

Guide athletes.

Responsibilities:

- Review
- Feedback
- Approve
- Request revisions
- Award XP
- Release next lesson

The coach lane owns coaching.

Not curriculum.

---

# 5. FIRESTORE

Purpose:

Store progress.

Examples:

```
athletes/

laneSubmissions/

xp_logs/

progress/

assignments/
```

Firestore stores facts.

It should never contain lesson definitions.

---

# 6. XP ENGINE

Purpose:

Interpret accomplishments.

Input:

```
Attendance

Strength

Honor

Arena

Competition
```

Output:

```
XP

Tier

Stripe

Promotion
```

XP should never know lesson content.

---

# 7. PUBLIC WEBSITE

Purpose:

Explain Sandman.

Not teach Sandman.

---

# Ownership

## Vault owns

- Courses
- Segments
- Lessons
- Missions
- Libraries
- Educational doctrine

---

## Arsenal owns

- Athlete resources
- Unlocked content
- Reference material

---

## Athlete Lane owns

- Daily experience
- Lesson presentation
- Submission

---

## Coach Lane owns

- Review
- Approval
- Feedback
- Progression

---

## Firestore owns

- Progress
- Status
- History
- XP records

---

## XP Engine owns

- Rules
- Promotion
- Economy

---

# Data Flow

```
Vault

↓

Lesson

↓

Athlete Lane

↓

Submission

↓

Coach Review

↓

XP Engine

↓

Firestore

↓

Unlock Next Lesson
```

---

# Future Goal

Eventually the athlete should never know where the lesson comes from.

Whether the source is:

```
course/

missions/

lesson/

library/
```

the lane simply asks:

> "What is today's lesson?"

and displays it.

---

# Architect's Rule

Never duplicate knowledge.

If two places teach the same thing,
one of them probably has the wrong responsibility.

Every folder should answer one question:

**"What do I own?"**