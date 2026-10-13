import assert from "node:assert/strict";
import test, {after, before} from "node:test";
import {createRequire} from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Firestore emulator required.");
if (!process.env.SANDMAN_TEST_BUILD_DIR) throw new Error("Temporary Functions build required.");

const require = createRequire(import.meta.url);
const admin = require("../../functions/node_modules/firebase-admin");
const projectId = process.env.GCLOUD_PROJECT || "demo-sandman-sponsored-athlete";
if (!admin.apps.length) admin.initializeApp({projectId});
const db = admin.firestore();
const practice = require(`${process.env.SANDMAN_TEST_BUILD_DIR}/practice/practiceSessions.js`);
const skill = require(`${process.env.SANDMAN_TEST_BUILD_DIR}/modules/skillCheckCoachCall.js`);
const xp = require(`${process.env.SANDMAN_TEST_BUILD_DIR}/services/authoritativeXpService.js`);
const call = (fn, uid, data) => fn.run({auth:{uid,token:{}},data,rawRequest:{}});

const coachUid = "coach-sponsored-regression";
const athleteId = "F8_SPONSORED_REGRESSION";
const sponsorship = Object.freeze({
  status: "active",
  program: "community-athlete-fund",
  sponsorId: "synthetic-sponsor",
  monthlyAmountCents: 12500,
});

before(async()=>{
  await db.doc(`staff/${coachUid}`).set({
    role:"coach",status:"active",locationIds:["santa-ynez-valley"],
  });
  await db.doc(`athletes/${athleteId}`).set({
    fullName:"Synthetic Sponsored Athlete",publicName:"Sponsored Athlete",
    locationId:"santa-ynez-valley",rosterStatus:"current",coachUid,
    journey:"Z2H",program:"youth-z2h-wrestling",primaryDiscipline:"wrestling",
    discipline:"wrestling",disciplineIds:["wrestling"],xp:0,xpCap:800,
    stripeCount:0,progressionTier:"T0",tier:"T0",rank:"Rookie",rankName:"Rookie",
    testing:{state:"ACTIVE"},tierStatus:"active",sponsorship,
  });
});

after(async()=>admin.app().delete());

test("sponsored athlete remains compatible across Practice, Attendance, XP, and Progression",async()=>{
  const opened=await call(practice.createOrRecoverCanonicalPractice,coachUid,{
    entryMode:"coach-directed",sessionDateKey:"2026-10-13",
    locationId:"santa-ynez-valley",discipline:"wrestling",
    program:"youth-z2h-wrestling",practiceKey:"sponsored-regression",
  });
  const practiceId=opened.practiceId;

  const review=await call(practice.getPracticeAttendanceReview,coachUid,{practiceId});
  assert.ok(review.roster.some((athlete)=>athlete.id===athleteId));

  await call(practice.updatePracticeCheckIn,coachUid,{practiceId,action:"start"});
  await call(practice.updatePracticeCheckIn,coachUid,{practiceId,action:"add",athleteId});
  const submitted=await call(practice.updatePracticeCheckIn,coachUid,{practiceId,action:"submit"});
  assert.deepEqual(submitted.attendance.checkedInIds,[athleteId]);

  const finalized=await call(practice.finalizePracticeAttendance,coachUid,{
    practiceId,presentIds:[athleteId],notes:"Synthetic sponsored-athlete verification",
  });
  assert.equal(finalized.status,"finalized");
  assert.equal((await db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`).get()).exists,true);

  const firstAward=await xp.awardXpAuthoritatively(coachUid,{
    uid:athleteId,kind:"ATTENDANCE",amount:10,
    meta:{source:"daily-grind",attendanceSessionId:practiceId,sessionId:practiceId},
  });
  const retryAward=await xp.awardXpAuthoritatively(coachUid,{
    uid:athleteId,kind:"ATTENDANCE",amount:10,
    meta:{source:"daily-grind",attendanceSessionId:practiceId,sessionId:practiceId},
  });
  assert.equal(firstAward.idempotent,false);
  assert.equal(retryAward.idempotent,true);
  assert.equal(retryAward.logId,firstAward.logId);

  const completed=await call(practice.completePracticeDailyGrind,coachUid,{
    practiceId,athleteIds:[athleteId],
  });
  assert.equal(completed.readyForDailyGrind,false);

  const verified=await call(skill.skillCheckCoachCall,coachUid,{
    action:"save",athleteId,discipline:"wrestling",familyId:"double_leg",
    state:"LEARNED",practiceId,
  });
  assert.equal(verified.practiceId,practiceId);
  assert.equal((await db.doc(`athletes/${athleteId}/skills/wrestling__double_leg`).get()).get("state"),"LEARNED");

  const closed=await call(practice.closePracticeSession,coachUid,{practiceId,attendanceSessionId:practiceId});
  assert.equal(closed.status,"closed");
  const athlete=(await db.doc(`athletes/${athleteId}`).get()).data();
  assert.equal(athlete.xp,10);
  assert.deepEqual(athlete.sponsorship,sponsorship);
  assert.equal(athlete.rosterStatus,"current");
  assert.equal(athlete.locationId,"santa-ynez-valley");
});
