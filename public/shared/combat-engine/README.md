# Combat Engine

## Overview

The Combat Engine is the shared rules engine for the Sandman System ecosystem.

Its responsibility is to understand the rules of combat sports and process competition events consistently across every Sandman product.

The Combat Engine is designed as reusable platform infrastructure.

It is not tied to any one application.

---

# Mission

Provide a single source of truth for combat sport rules, scoring, match logic, and competition processing.

Every Sandman product should calculate matches exactly the same way.

---

# Products Using the Combat Engine

* Sandman System
* CornermanAI
* Wrestling Video Game
* Coach Dashboard
* Parent Dashboard
* Training Simulations
* Future Mobile Applications

---

# Responsibilities

The Combat Engine owns:

* Match creation
* Match state
* Scoring
* Positions
* Rule sets
* Event processing
* Win conditions
* Statistics generation
* Competition logic

The Combat Engine does **not** own:

* Athlete profiles
* Lifetime XP
* Promotions
* Curriculum
* Certificates
* Firebase
* Authentication
* User Interface

Those responsibilities belong to Sandman System.

---

# Architecture

```
Sandman System
        │
        ▼
 Sandman Bridge
        │
        ▼
 Combat Engine
        │
 ┌──────┼──────────────┐
 │      │              │
 ▼      ▼              ▼
CornermanAI   Wrestling Game   Future Products
```

The Combat Engine determines what happened during competition.

The Sandman Bridge determines whether verified activity affects an athlete's profile.

---

# Current Rule Sets

* Folkstyle Wrestling
* Freestyle Wrestling
* Greco-Roman Wrestling
* Beach Wrestling

Future support:

* Boxing
* Kickboxing
* MMA
* Grappling
* Brazilian Jiu-Jitsu
* Additional combat sports

---

# Design Principles

* One engine.
* Multiple products.
* Rules live in one place.
* Products consume the engine.
* Sandman owns progression.
* Combat Engine owns competition.

---

# Long-Term Vision

Every Sandman application should rely on the Combat Engine for match logic.

CornermanAI analyzes matches.

The Wrestling Video Game simulates matches.

Sandman Academy tracks athlete development.

All three operate from the exact same combat rules.

One rule engine.

One source of truth.

Unlimited applications.

---

# Current Status

Version: 1.0

Development Phase: Foundation

Current Focus:

* Wrestling rule sets
* Match engine
* Event processing
* Shared architecture
* Unit testing

Future Milestones:

* Match clock
* Period management
* Overtime
* Penalties
* Statistics engine
* AI simulation
* Video replay integration
* Multi-sport expansion

---

## Core Philosophy

The Combat Engine should be independent.

If every Sandman application disappeared tomorrow, the Combat Engine should still function as a complete and accurate combat rules engine capable of processing matches on its own.

Everything else builds on top of that foundation.
