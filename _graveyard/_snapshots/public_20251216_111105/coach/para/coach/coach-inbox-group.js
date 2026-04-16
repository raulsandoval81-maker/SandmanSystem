// public/communications/coach-inbox-group.js
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { monthKey } from "../para-message-engine.js";

/**
 * Load and group messages by family, then by athlete.
 * Returns a structure like:
 * {
 *   "Sandoval Family": {
 *     familyName: "Sandoval Family",
 *     totalUnread: 3,
 *     familyUnread: 0,
 *     familyThreads: [ ... ],
 *     athletes: {
 *       "F8-0001": { name: "Richie", unread: 1, threads: [...] },
 *       "F8-0002": { name: "Max", unread: 2, threads: [...] }
 *     }
 *   },
 *   ...
 * }
 */
export async function loadGroupedCoachInbox({ db }) {
  const key = monthKey();
  const families = {};

  // -------- 1) FAMILY THREADS --------
  const familySnap = await getDocs(collection(db, "comms", key, "family"));
  familySnap.forEach(docSnap => {
    const d = docSnap.data();
    const familyName = d.familyName || "Family";
    if (!families[familyName]) {
      families[familyName] = {
        familyName,
        totalUnread: 0,
        familyUnread: 0,
        familyThreads: [],
        athletes: {}
      };
    }

    const unread = d.unreadForCoach ? 1 : 0;
    families[familyName].totalUnread += unread;
    families[familyName].familyUnread += unread;
    families[familyName].familyThreads.push({
      entryId: docSnap.id,
      unreadForCoach: !!d.unreadForCoach,
      lastSender: d.lastSender,
      scope: "family",
      data: d
    });
  });

  // -------- 2) ATHLETE THREADS --------
  const athleteRoot = collection(db, "comms", key, "athletes");
  const athleteParentsSnap = await getDocs(athleteRoot); // this gives each athleteUID as a sub-collection container

  for (const athleteDoc of athleteParentsSnap.docs) {
    const athleteUid = athleteDoc.id;
    // subcollection: entries
    const entriesSnap = await getDocs(collection(db, "comms", key, "athletes", athleteUid, "entries"));
    entriesSnap.forEach(entrySnap => {
      const d = entrySnap.data();
      const familyName = d.familyName || "Family";
      if (!families[familyName]) {
        families[familyName] = {
          familyName,
          totalUnread: 0,
          familyUnread: 0,
          familyThreads: [],
          athletes: {}
        };
      }

      const fam = families[familyName];
      if (!fam.athletes[athleteUid]) {
        fam.athletes[athleteUid] = {
          athleteUid,
          athleteName: d.athleteName || "(Athlete)", // optional field
          unread: 0,
          threads: []
        };
      }

      const unread = d.unreadForCoach ? 1 : 0;
      fam.totalUnread += unread;
      fam.athletes[athleteUid].unread += unread;
      fam.athletes[athleteUid].threads.push({
        entryId: entrySnap.id,
        unreadForCoach: !!d.unreadForCoach,
        lastSender: d.lastSender,
        scope: "athlete",
        athleteUid,
        data: d
      });
    });
  }

  return families;
}
