# Sandman Database Architecture

STATUS

LOCKED

Purpose

Define the philosophy, organization, and responsibilities of the Sandman data model.

This document intentionally avoids implementation-specific code.

Instead, it defines ownership and structure.

---

# Philosophy

The database exists to represent reality.

Collections represent business responsibilities.

Collections do not exist simply because pages exist.

One responsibility.

One owner.

One source of truth.

---

# Primary Domains

PUBLIC

↓

ADMISSIONS

↓

ENROLLMENT

↓

OPERATIONS

↓

ATHLETES

↓

COMPETITION

↓

SYSTEM

---

# Public Domain

Purpose

Capture public interaction.

Examples

Interest

General Messages

Contact

Promotions

No athlete exists yet.

---

# Admissions Domain

Purpose

Evaluate prospective athletes.

Examples

Interest Leads

Admissions Requests

Appointments

Prospect Builder

Proposal

Admissions ends at Enrollment.

---

# Enrollment Domain

Purpose

Transition prospects into active athletes.

Examples

House Standards

Stripe

Pledge

Intake

Coach Review

Mint

Enrollment creates operational records.

---

# Operations Domain

Purpose

Operate the academy.

Examples

Families

Parents

Coaches

Management

Schedules

Communication

Attendance

---

# Athlete Domain

Purpose

Develop athletes.

Examples

Athletes

Journeys

XP

Ranks

Testing

Achievements

Training

Competition

---

# Competition Domain

Purpose

Track external participation.

Examples

Events

Matches

Results

Rankings

Awards

Statistics

---

# System Domain

Purpose

Support the platform.

Examples

Organizations

Academies

Locations

Permissions

Roles

Audit Logs

Tokens

Settings

Templates

Notifications

---

# Collection Rules

Every collection should answer:

Who owns it?

Who writes it?

Who reads it?

Why does it exist?

If those answers are unclear...

The collection probably should not exist.

---

# Source of Truth

Never duplicate business ownership.

Example

Proposal owns pricing.

Stripe owns payment execution.

Athlete owns progression.

Coach owns recommendation.

Management owns operations.

Admin owns governance.

---

# Relationships

Prefer relationships over duplication.

Link records.

Do not copy records unless necessary.

Historical snapshots are acceptable.

Operational duplication is discouraged.

---

# Long-Term Goal

A developer unfamiliar with Sandman should understand:

why every collection exists,

who owns it,

and where it belongs,

simply by reading this document.

