# Billing Architecture

STATUS

LOCKED

Purpose

Define the billing philosophy and payment architecture of Sandman System.

Billing exists to support enrollment.

Billing does not own enrollment.

Billing does not own athlete development.

---

# Philosophy

Families purchase participation.

Athletes earn progression.

Never combine those responsibilities.

---

# Billing Model

One Family

↓

One Stripe Customer

↓

One Billing Relationship

↓

Multiple Athletes

Each athlete maintains an independent operational record.

---

# Responsibilities

Billing owns:

• Stripe Customer

• Payment Method

• Subscription

• Invoice History

• Payment Status

Billing does NOT own:

• Programs

• Proposal

• Athlete Progression

• XP

• Rank

• Attendance

---

# Proposal Relationship

Proposal defines:

Programs

Pricing

Discounts

Funding

Billing Structure

Billing executes the Proposal.

Billing never creates the Proposal.

---

# Stripe

Stripe responsibilities

Payment

Invoices

Subscriptions

Payment Methods

Receipts

Webhook Events

Stripe should never become the source of truth for athlete information.

---

# Sandman Responsibilities

Sandman owns:

Families

Athletes

Programs

Enrollment

Membership State

Coaches

Locations

Organizations

Billing state should synchronize with Stripe.

---

# Membership State

Membership status should always be determined by verified payment events.

Never rely solely on browser redirects.

Webhook confirmation is authoritative.

---

# Future Growth

Billing should support:

Monthly Memberships

Annual Memberships

Scholarships

Partner Funding

Charter Programs

Split Payments

Credits

Family Discounts

Multiple Academies

Without changing doctrine.

