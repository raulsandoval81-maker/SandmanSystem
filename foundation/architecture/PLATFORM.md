# Sandman Platform Architecture

STATUS

LOCKED

Version

1.0

Purpose

Define the highest-level architecture of Sandman System.

This document explains how every major subsystem relates to every other subsystem.

This is the blueprint of the platform.

---

# Platform Philosophy

Sandman is a coach-led operating system.

Software exists to help organizations develop people.

Every system exists for one primary purpose.

Responsibilities should not overlap.

---

# Platform Layers

Foundation

↓

Public Experience

↓

Business Pipeline

↓

Operations

↓

Athlete Development

↓

Infrastructure

---

==================================================
FOUNDATION
==================================================

Purpose

Defines doctrine.

Defines architecture.

Defines standards.

Defines institutional memory.

Repository

/foundation

Changes rarely.

Guides everything else.

---

==================================================
PUBLIC EXPERIENCE
==================================================

Purpose

Introduce Sandman.

Educate.

Build trust.

Generate interest.

Repository

/public

Examples

Website

Marketing

Journeys

Origins

Impact

Connect

---

==================================================
BUSINESS PIPELINE
==================================================

Purpose

Acquire athletes.

Pipeline

Interest

↓

Admissions

↓

Appointments

↓

Prospect Builder

↓

Proposal

↓

Enrollment

↓

Operational Athlete

Everything before Operational Athlete
belongs to the business pipeline.

---

==================================================
OPERATIONS
==================================================

Purpose

Operate academies.

Examples

Management

Coach

Scheduling

Communication

Attendance

Families

Reporting

---

==================================================
ATHLETE DEVELOPMENT
==================================================

Purpose

Develop athletes.

Examples

XP

Ranks

Journeys

Curriculum

Testing

Competition

Progression

Everything after enrollment lives here.

---

==================================================
INFRASTRUCTURE
==================================================

Purpose

Support every other layer.

Examples

Firebase

Firestore

Cloud Functions

Stripe

Authentication

Storage

Email

Logging

Infrastructure supports.

Infrastructure does not define.

---

# Information Flow

Foundation

↓

Architecture

↓

Implementation

↓

Operations

↓

Athlete Experience

Never reverse this order.

---

# Design Rules

Every layer owns responsibilities.

Layers communicate.

Layers do not absorb one another.

Complexity should be isolated.

Doctrine should remain simple.

---

# Long-Term Goal

Sandman should support:

One Coach

↓

One Academy

↓

Multiple Locations

↓

Partner Academies

↓

National Expansion

Without changing the platform architecture.

