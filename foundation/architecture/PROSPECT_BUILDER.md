# Prospect Builder Architecture

STATUS

LOCKED

Version

1.0

Purpose

The Prospect Builder is the coach's decision-support system during the admissions appointment.

It helps transform an interested prospect into a properly structured proposal.

It is not simply a pricing calculator.

---

# Philosophy

Families should never feel like they are buying a membership.

They should feel like the coach is helping them find the right path.

The Prospect Builder supports that conversation.

---

# Primary Responsibilities

Receive the Admissions Appointment handoff.

Review athlete and family information.

Recommend the correct journey.

Recommend the correct discipline.

Evaluate billing options.

Apply promotions.

Apply funding sources.

Generate Proposal.

Transfer Proposal to Enrollment.

---

# Inputs

Admissions Request

↓

Admissions Appointment

↓

Coach Notes

↓

Athlete Information

↓

Family Information

---

# Outputs

Proposal

Coach Recommendation

Enrollment Handoff

---

# Builder Philosophy

The Builder is exploratory.

Coaches should be able to test different scenarios before creating the final proposal.

Nothing becomes official until Proposal creation.

---

# Recommendation Engine

The coach remains responsible.

The software assists.

Recommendations may consider:

Age

Goals

Experience

Family size

Funding

Schedule

Discipline

Coach observations

Software recommends.

Coach decides.

---

# Funding Paths

The Builder should support multiple entry paths.

Examples

Standard Enrollment

Scholarship

Partner Program

Charter School

Sponsored Athlete

Special Circumstances

All paths should generate a Proposal.

---

# Proposal Creation

Proposal becomes the official offer.

Builder data becomes historical context.

Proposal becomes operational.

---

# Design Rules

Prospect Builder owns recommendations.

Proposal owns agreements.

Stripe owns payment.

Enrollment owns onboarding.

Intake owns operational information.

---

# Future Expansion

Builder should eventually support:

Multi-athlete families

Program comparison

Financial assistance

Promotion engine

Projected monthly revenue

Coach notes

Printable proposal

Digital proposal

