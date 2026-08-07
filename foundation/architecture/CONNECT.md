cat > foundation/architecture/CONNECT.md <<'EOF'
# Connect Architecture

STATUS

LOCKED

Last Updated

August 2026

---

# Purpose

Connect is the public acquisition and admissions pipeline for Sandman System.

Its responsibility is to move a prospect from first contact to enrollment.

Connect does not own athlete operations.

Connect owns the sales and admissions lifecycle.

---

# Primary Goal

Convert interested families into enrolled athletes through a coach-guided admissions process.

---

# Philosophy

Sandman is not a self-service gym.

The coach guides every major decision.

The software supports the coach.

---

# Canonical Pipeline

Public Website

↓

Connect

↓

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

↓

Intake

↓

Operational Athlete

---

# Stage Responsibilities

## Interest

Purpose

Capture interest from the public.

Outputs

• Prospect information

• Initial goals

• Preferred programs

• Contact information

Owner

Coach

---

## Coach Review

Purpose

Review submitted interest.

Determine whether admissions should continue.

Outputs

Admissions Request

---

## Admissions Request

Purpose

Internal admissions record.

Tracks communication and scheduling.

Outputs

Admissions Appointment

---

## Admissions Appointment

Purpose

Meet the family.

Understand goals.

Determine program fit.

Outputs

Prospect Builder

---

## Prospect Builder

Purpose

Coach decision tool.

Responsibilities

• Program selection

• Family pricing

• Discounts

• Funding routes

• Proposal creation

Prospect Builder is not simply a calculator.

---

## Proposal

Purpose

Business agreement.

Proposal defines:

• Programs

• Billing

• Pricing

• Funding

• Agreement

Proposal always precedes payment.

---

## Enrollment

Purpose

Coach-guided closing process.

Enrollment includes:

House Standards

↓

Stripe

↓

Pledge

↓

Coach-controlled Intake

↓

Coach Review

↓

Mint

Enrollment transitions the family into operational systems.

---

## Intake

Purpose

Collect operational information.

Includes:

• Medical

• Emergency

• Waiver

• Required acknowledgements

Intake is not Enrollment.

---

# Connect Boundaries

Connect owns:

Interest

Admissions

Appointments

Prospect Builder

Proposal

Enrollment

Connect does not own:

XP

Training

Attendance

Progression

Coach operations

Management operations

Athlete development

---

# Design Rules

Every stage has one responsibility.

No stage should duplicate another.

Coach authority remains central.

Proposal precedes payment.

Payment precedes Intake.

Operational systems begin only after Enrollment.

---

# Future Growth

Connect should support:

Multiple organizations

Multiple academies

Multiple locations

Partner facilities

Franchise operations

Without changing the admissions doctrine.

EOF