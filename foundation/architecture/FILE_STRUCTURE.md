# Sandman File Structure

STATUS

LOCKED

VERSION

1.0

Purpose

Define the organizational philosophy of the Sandman repository.

Folders represent responsibilities.

They do not merely group similar files.

---

# Repository Philosophy

Every folder should answer:

What responsibility does this own?

If that answer is unclear,

the folder probably should not exist.

---

# Root Structure

SandmanSystem/

foundation/

functions/

public/

system/

firebase.json

firestore.rules

storage.rules

README.md

---

# Foundation

Purpose

Institutional memory.

Contains:

Constitution

Architecture

Business

Playbooks

Standards

Reference

AI Context

History

Foundation changes slowly.

---

# Functions

Purpose

Server-side business logic.

Examples

Stripe

Proposal

Mint

Notifications

Webhooks

Authentication

No UI belongs here.

---

# Public

Purpose

Client-facing application.

Contains:

Website

Management

Coach

Parent

Athlete

Connect

Enrollment

Intake

Assets

UI belongs here.

---

# System

Purpose

Shared platform systems.

Examples

XP

Tokens

Rules

Configuration

Engine

These systems support the entire platform.

---

# Folder Rules

Every folder should own one responsibility.

Avoid generic folders such as:

misc

new

temp

old

test2

copy

backup-final-final

Archive intentionally.

Do not accumulate clutter.

---

# Naming

Prefer:

admissions/

proposal/

enrollment/

management/

Avoid:

new-enrollment/

proposal-v2/

test/

copy/

old/

---

# Shared Code

Reusable logic belongs in shared modules.

Do not duplicate utilities across folders.

---

# Assets

Images

Icons

Fonts

PDFs

should remain centralized whenever practical.

---

# Documentation

Documentation belongs in Foundation.

Avoid scattered documentation throughout the repository unless tightly coupled to implementation.

---

# Long-Term Goal

A new developer should understand the repository structure without needing verbal explanation.

Folder names should communicate ownership.

