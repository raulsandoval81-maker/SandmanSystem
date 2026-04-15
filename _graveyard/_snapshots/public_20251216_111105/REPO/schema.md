# Sandman System – Firestore Schema

This schema defines the collections, documents, and rules powering the Intake → Approval → Athlete pipeline.

---

## Collections

### `/intakes/{inviteToken}`
**Purpose:** Parent-side invite + submission “envelope.”  
**Status Flow:** `invited` → `submitted` → `approved` | `rejected` | `expired`

**Fields:**
- `status: string` — `"invited" | "submitted" | "approved" | "rejected" | "expired"`
- `createdAt: Timestamp`
- `expiresAt: Timestamp` (48h default)
- `submittedAt?: Timestamp`
- `coachReviewedAt?: Timestamp`
- `coachReviewer?: string`
- `athleteUid?: string`
- `token: string`
- `team?: string`, `city?: string`, `state?: string`
- `snapshot: { first,last,dob,parentEmail,parentPhone,emerName,emerPhone,med,waiverAck }`
- `waiver: { brand:"Sandman Systems"|"Sandman Combat", filePath:string, viewedAt: Timestamp }`

---

### `/athletes/{uid}`
**Purpose:** Canonical athlete record created on approval.  
**IDs:** `F8-02637` (Foundry 8) or `F4-00025` (Foundry 4)

**Fields:**
- `uid: string`
- `track: "F8" | "F4"`
- `publicName: string`
- `privateName?: string`
- `org: { team?: string, city?: string, state?: string }`
- `padlock: string` — global 6-digit ID
- `tier: "T0"` (canonical start)
- `rank: "Shadow" | "Apprentice"`
- `status: "active" | "pending-exception"`
- `approvedBy: string`
- `approvedAt: Timestamp`
- `sourceIntakeId: string`

**Future Subcollections:**
- `skills/{skillId}` → `{ status:"red"|"gray"|"yellow"|"green", reps:number, days:number }`
- `mindset/summary` → `{ flags:{respect:number,...}, updatedAt }`

---

### `/exceptionRequests/{athleteUid}`
**Purpose:** 48h review queue for FastTrack/DualProg.  
**Fields:**
- `uid: string`
- `track: "F8"|"F4"`
- `createdAt: Timestamp`
- `expiresAt: Timestamp`
- `status: "pending" | "approved" | "rejected" | "expired"`
- `fastTrack?: { requested, yearsTrained?, proofLink? }`
- `dualProg?: { requested, startTier:"T0".."T3", parentAck, coachNote? }`
- `intakeId: string`
- `publicName: string`
- `privateName?: string`
- `org: { team?, city?, state? }`

---

### `/approvals/{athleteUid}`
**Purpose:** Lightweight mirror of approval outcome.  
**Fields:**
- `uid, track, padlock, publicName, privateName?`
- `team?, city?, state?`
- `actorUid: string`
- `clientTs?: string`
- `serverTs: Timestamp`
- `exceptionFlags: { fastTrack:boolean, dualProg:boolean }`

---

### `/adminLogs/intake/{YYYYMM}/events/{logId}`
**Purpose:** Immutable forensic audit trail.  
**Fields:**
- `action: "invite_create" | "intake_submit" | "intake_approve" | "intake_reject" | "exception_open" | "exception_resolve"`
- `actorUid?: string`
- `intakeId?: string`
- `athleteUid?: string`
- `track?: "F8"|"F4"`
- `outcome?: "ok" | "error" | "expired"`
- `detail?: string`
- `ts: Timestamp`

---

### `/counters/padlock`
**Purpose:** Global 6-digit padlock auto-increment.  
**Fields:**
- `last: number`

---

## Storage Layout
- `waivers/{inviteToken}.pdf`  
Linked in `/intakes/{token}.waiver.filePath`.

---

## Status Machines

**Invite → Intake → Approval**





// intakes/AB12CD34



{
  "status": "invited" | "submitted" | "expired" | "consumed",
  "createdAt": <Timestamp>,
  "expiresAt": <Timestamp>,
  "submittedAt": <Timestamp|null>,

  // snapshot from parent form (when submitted)
  "snapshot": {
    "first": "Chantalle",
    "last": "Castellanos",
    "dob": "2012-05-11",
    "parentEmail": "parent@ex.com",
    "parentPhone": "555-123-1234",
    "emerName": "Aunt May",
    "emerPhone": "555-555-1212",
    "med": "peanut allergy",

    // waiver gate
    "waiver": {
      "openedAt": <Timestamp>,         // when PDF viewed
      "accepted": true,                // checkbox
      "sign": "Parent Full Name",
      "signDate": "2025-03-10",
      "file": {
        "bucket": "…",
        "path": "waivers/2025/…/AB12CD34.pdf",
        "url": "gs://…"
      }
    }
  },

  // routing info (from coach invite)
  "org": { "team": "Trojan Combat", "city": "Riverside", "state": "CA" }
}







// athletes/F8-02637
{
  "uid": "F8-02637",
  "track": "F8",                        // "F8" | "F4"
  "tier": "T0",                         // server canonical start
  "rank": "Shadow" | "Apprentice",
  "status": "active" | "pending-exception",

  "publicName": "C. Castellanos",
  "privateName": "Chantalle Castellanos",

  "org": { "team": "Trojan Combat", "city": "Riverside", "state": "CA" },

  "padlock": "000123",                  // 6-digit global counter
  "sourceIntakeId": "AB12CD34",

  "approvedBy": "<coachUid>",
  "approvedAt": <Timestamp>,

  // seed for future modules
  "xp": 0,
  "xpByLane": { "combat": 0, "character": 0 },
  "compGate": 800                       // policy default
}







// approvals/F8-02637
{
  "uid": "F8-02637",
  "track": "F8",
  "padlock": "000123",
  "publicName": "C. Castellanos",
  "privateName": "Chantalle Castellanos",

  "team": "Trojan Combat",
  "city": "Riverside",
  "state": "CA",

  "actorUid": "<coachUid>",
  "clientTs": "2025-03-11T18:44:12.000Z",
  "serverTs": <Timestamp>,

  "exceptionFlags": { "fastTrack": false, "dualProg": true }
}







// exceptionRequests/F8-02637
{
  "uid": "F8-02637",
  "track": "F8",
  "createdAt": <Timestamp>,
  "expiresAt": <Timestamp>,
  "status": "pending" | "approved" | "denied" | "expired",

  "fastTrack": {
    "requested": false,
    "yearsTrained": null,
    "proofLink": null
  },

  "dualProg": {
    "requested": true,
    "startTier": "T3",                // clamped ≤ T3 (Warrior)
    "parentAck": true,
    "coachNote": "Wants peers bracket"
  },

  "publicName": "C. Castellanos",
  "privateName": "Chantalle Castellanos",
  "intakeId": "AB12CD34",
  "org": { "team": "Trojan Combat", "city": "Riverside", "state": "CA" }
}





// adminLogs/intake/202503/events/a1b2c3
{
  "action": "approve" | "reject" | "expire" | "createInvite" | "submitIntake",
  "actorUid": "<coachUid|null>",
  "intakeId": "AB12CD34",
  "athleteUid": "F8-02637",
  "ts": <Timestamp>,
  "outcome": "ok",
  "meta": {
    "track": "F8",
    "padlock": "000123",
    "exception": { "fastTrack": false, "dualProg": true }
  }
}




// counters/padlock
{ "last": 123 }     // next = 124 → "000124"






// teams/trojan-combat
{
  "name": "Trojan Combat",
  "city": "Riverside",
  "state": "CA",
  "slug": "trojan-combat",
  "ownerUid": "<coachUid>",
  "createdAt": <Timestamp>
}
