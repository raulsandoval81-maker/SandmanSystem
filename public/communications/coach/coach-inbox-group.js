// public/communications/coach-inbox-group.js
// ------------------------------------------------------------
// Para-Comms — Group Unified Coach Threads
//
// Source:
//   paraThreads/{athleteUid}
//
// Groups:
//   family → athlete
//
// Unread truth:
//   coachHasUnread === true
//
// Archived and deleted threads are hidden by default.
// ------------------------------------------------------------

import {
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Returns:
 *
 * {
 *   "Sandoval Family": {
 *     familyName: "Sandoval Family",
 *     totalUnread: 3,
 *     familyUnread: 0,
 *     familyThreads: [],
 *     athletes: {
 *       "F8_0001": {
 *         athleteUid: "F8_0001",
 *         athleteName: "Athlete Name",
 *         discipline: "wrestling",
 *         unread: 1,
 *         threads: [...]
 *       }
 *     }
 *   }
 * }
 */

export async function loadGroupedCoachInbox({
  db,
  includeArchived = false,
  includeDeleted = false
} = {}) {
  if (!db) {
    throw new Error(
      "loadGroupedCoachInbox requires Firestore db."
    );
  }

  const families = {};

  const qRef = query(
    collection(db, "paraThreads"),
    orderBy("updatedAt", "desc")
  );

  const snap = await getDocs(qRef);

  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};

    if (
      !includeArchived &&
      data.archived === true
    ) {
      return;
    }

    if (
      !includeDeleted &&
      data.deleted === true
    ) {
      return;
    }

    const athleteUid = String(
      data.athleteUid ||
      data.athleteId ||
      docSnap.id ||
      ""
    )
      .trim()
      .toUpperCase();

    const athleteName =
      data.athleteName ||
      data.publicName ||
      data.fullName ||
      athleteUid ||
      "(Athlete)";

    const familyName =
      data.familyName ||
      data.parentLastName ||
      data.guardianFamilyName ||
      `${athleteName} Family`;

    const discipline =
      normalizeDiscipline(
        data.discipline ||
        data.primaryDiscipline ||
        data.sport ||
        data.art ||
        ""
      );

    if (!families[familyName]) {
      families[familyName] = {
        familyName,
        totalUnread: 0,
        familyUnread: 0,
        familyThreads: [],
        athletes: {}
      };
    }

    const family =
      families[familyName];

    const unreadForCoach =
      data.coachHasUnread === true;

    const unreadCount =
      unreadForCoach ? 1 : 0;

    family.totalUnread +=
      unreadCount;

    const thread = {
      id: docSnap.id,
      athleteUid,
      athleteName,
      discipline,
      unreadForCoach,

      lastSender:
        data.lastSender ||
        data.lastReplyFrom ||
        data.fromName ||
        "",

      lastBody:
        data.lastBody ||
        data.preview ||
        "",

      lastReplyAt:
        data.lastReplyAt ||
        data.updatedAt ||
        data.createdAt ||
        null,

      createdAt:
        data.createdAt ||
        null,

      scope:
        athleteUid
          ? "athlete"
          : "family",

      data
    };

    if (athleteUid) {
      if (
        !family.athletes[
          athleteUid
        ]
      ) {
        family.athletes[
          athleteUid
        ] = {
          athleteUid,
          athleteName,
          discipline,
          unread: 0,
          threads: []
        };
      }

      const athleteGroup =
        family.athletes[
          athleteUid
        ];

      athleteGroup.unread +=
        unreadCount;

      athleteGroup.threads.push(
        thread
      );
    } else {
      family.familyUnread +=
        unreadCount;

      family.familyThreads.push(
        thread
      );
    }
  });

  return families;
}

function normalizeDiscipline(
  value = ""
) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (raw.includes("kickbox")) {
    return "kickboxing";
  }

  if (raw.includes("wrest")) {
    return "wrestling";
  }

  if (
    raw === "mma" ||
    raw.includes("mixed martial")
  ) {
    return "mma";
  }

  if (
    raw.includes("submission") ||
    raw.includes("grappling")
  ) {
    return "submission-grappling";
  }

  if (raw.includes("box")) {
    return "boxing";
  }

  return raw;
}