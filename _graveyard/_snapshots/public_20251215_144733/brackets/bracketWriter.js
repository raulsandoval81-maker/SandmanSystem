import { db } from "../firebase-init.js";

/* 
saveMatch({
  eventId,
  bracketId,
  matchId,
  red, green,
  scoreRed, scoreGreen,
  winner, result, period
})
*/

export async function saveMatch(data) {
  const ref = db
    .collection("events")
    .doc(data.eventId)
    .collection("brackets")
    .doc(data.bracketId)
    .collection("matches")
    .doc(data.matchId);

  const payload = {
    red: data.red,
    green: data.green,
    scoreRed: data.scoreRed,
    scoreGreen: data.scoreGreen,
    winner: data.winner,
    result: data.result,       // DEC, MD, TECH, FALL
    period: data.period || 3,
    updatedAt: new Date()
  };

  await ref.set(payload, { merge: true });

  console.log(`BRACKET UPDATE → ${data.bracketId} M${data.matchId}`, payload);
}
