import {
  db,
  auth,
  ensureSignedIn,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

const currentUid = auth.currentUser?.uid || null;
const THREAD_LIMIT = 12;

const headEl = document.getElementById("thread-head");
const msgEl = document.getElementById("thread-messages");
const replyEl = document.getElementById("reply-body");
const btnSend = document.getElementById("btn-reply");

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function disableReply() {
  if (replyEl) replyEl.disabled = true;
  if (btnSend) btnSend.disabled = true;
}

function setReplyEnabled(enabled) {
  if (replyEl) replyEl.disabled = !enabled;
  if (btnSend) btnSend.disabled = !enabled;
}

function renderBlocked(title, body) {
  if (headEl) headEl.innerHTML = `<div style="opacity:.75;">${esc(title)}</div>`;
  if (msgEl) msgEl.innerHTML = `<div class="card" style="opacity:.75;">${esc(body)}</div>`;
  disableReply();
}

function tsLabel(ts) {
  try {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : ts;
    return d?.toLocaleString?.() || "";
  } catch {
    return "";
  }
}

function scrollBottomFast() {
  if (!msgEl) return;
  requestAnimationFrame(() => {
    try {
      msgEl.scrollTop = msgEl.scrollHeight;
    } catch {}
  });
}

function getAthleteIdFromUrl() {
  const p = new URLSearchParams(location.search);
  return String(p.get("athleteUid") || p.get("id") || "").trim();
}

async function resolveAthleteForParent(parentUid, requestedAthleteUid) {
  // links first
  if (requestedAthleteUid) {
    const exactLinkQ = query(
      collection(db, "parentAthleteLinks"),
      where("parentUid", "==", parentUid),
      where("athleteUid", "==", requestedAthleteUid)
    );
    const exactLinkSnap = await getDocs(exactLinkQ);
    if (!exactLinkSnap.empty) {
      return exactLinkSnap.docs[0].data();
    }
  }

  const linksQ = query(
    collection(db, "parentAthleteLinks"),
    where("parentUid", "==", parentUid)
  );
  const linksSnap = await getDocs(linksQ);
  if (!linksSnap.empty) {
    return linksSnap.docs[0].data();
  }

  // legacy fallback
  if (requestedAthleteUid) {
    const athleteRef = doc(db, "athletes", requestedAthleteUid);
    const athleteSnap = await getDoc(athleteRef);
    if (athleteSnap.exists()) {
      const a = athleteSnap.data() || {};
      if (String(a.parentUid || "") === String(parentUid)) {
        return {
          athleteUid: requestedAthleteUid,
          athleteName: a.name || a.athleteName || ""
        };
      }
    }
  }

  return null;
}

if (!currentUid) {
  renderBlocked("Not signed in.", "Please sign in first.");
  throw new Error("[parent-thread] Missing currentUid");
}

const requestedAthleteUid = getAthleteIdFromUrl();
const link = await resolveAthleteForParent(currentUid, requestedAthleteUid);

if (!link?.athleteUid) {
  renderBlocked("No athlete linked.", "No athlete could be resolved for this parent account.");
  throw new Error("[parent-thread] No linked athlete");
}

const athleteUid = String(link.athleteUid).trim();
const athleteName = String(link.athleteName || "").trim();

const threadRef = doc(db, "paraThreads", athleteUid);
const threadSnap = await getDoc(threadRef);
console.log("[parent-thread] thread root exists:", threadSnap.exists());
console.log("[parent-thread] thread root data:", threadSnap.exists() ? threadSnap.data() : null);

// create thread root if missing
if (!threadSnap.exists()) {
  await setDoc(
    threadRef,
    {
      athleteUid,
      athleteName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastBody: "",
      parentHasUnread: false,
      coachHasUnread: false
    },
    { merge: true }
  );
}

const messagesCol = collection(db, "paraThreads", athleteUid, "messages");

if (headEl) {
  headEl.innerHTML = `
    <div><strong>${esc(athleteName || athleteUid)}</strong></div>
    <div style="opacity:.75;">Athlete thread</div>
  `;
}

setReplyEnabled(true);

const qRef = query(messagesCol, orderBy("createdAt", "asc"), limit(THREAD_LIMIT));
console.log("[parent-thread] currentUid:", currentUid);
console.log("[parent-thread] requestedAthleteUid:", requestedAthleteUid);
console.log("[parent-thread] resolved link:", link);

console.log("[parent-thread] athleteUid:", athleteUid);
console.log(
  "[parent-thread] reading path:",
  `paraThreads/${athleteUid}/messages`
);

onSnapshot(
  qRef,
  async (snap) => {
    console.log("[parent-thread] snapshot size:", snap.size);
    console.log(
      "[parent-thread] snapshot docs:",
      snap.docs.map(d => ({ id: d.id, ...d.data() }))
    );

    if (!msgEl) return;

    if (snap.empty) {
      msgEl.innerHTML = `<div class="card" style="opacity:.75;">No messages yet. Send one below.</div>`;
      return;
    }
    const rows = [];
    for (const ds of snap.docs) {
      const m = ds.data() || {};
      const from = String(m.from || "").toLowerCase();
      const who =
        from === "coach"
          ? "Coach"
          : String(m.fromName || auth.currentUser?.email || "Parent");

      rows.push(`
        <div class="thread-msg ${from === "coach" ? "coach" : "parent"}">
          <div class="from">${esc(who)}</div>
          <div class="timestamp">${esc(tsLabel(m.createdAt))}</div>
          <div class="body">${esc(m.body || "")}</div>
        </div>
      `);

     if (from === "coach" && m.seenByParent !== true) {
       await updateDoc(ds.ref, { seenByParent: true });
     }
    }

    msgEl.innerHTML = rows.join("");
    scrollBottomFast();

    await setDoc(
      threadRef,
      {
        parentHasUnread: false,
        seenByParent: true,
        parentOpenedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  },
  (err) => {
    console.error("[parent-thread] snapshot failed:", err);
    renderBlocked("Error loading thread.", "Check console for details.");
  }
);

btnSend?.addEventListener("click", async () => {
  const body = String(replyEl?.value || "").trim();
  if (!body) return;
  if (btnSend.disabled || replyEl?.disabled) return;

  btnSend.disabled = true;
  const old = btnSend.textContent || "Send";
  btnSend.textContent = "Sending…";

  try {
    await addDoc(messagesCol, {
      body,
      from: "parent",
      fromUid: currentUid,
      fromName: auth.currentUser?.displayName || auth.currentUser?.email || "Parent",
      createdAt: serverTimestamp(),
      seenByCoach: false,
      seenByParent: true
    });

    await setDoc(
      threadRef,
      {
        athleteUid,
        athleteName,
        updatedAt: serverTimestamp(),
        lastBody: body,
        lastReplyAt: serverTimestamp(),
        coachHasUnread: true,
        parentHasUnread: false,
        seenByCoach: false,
        seenByParent: true
      },
      { merge: true }
    );

    if (replyEl) replyEl.value = "";
  } catch (e) {
    console.error("[parent-thread] send failed:", e);
    alert("Send failed. Check console.");
  } finally {
    btnSend.textContent = old;
    btnSend.disabled = false;
  }
});