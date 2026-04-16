// ---------------------------------------------------------
// AUTO MONTH — YYYY-MM
// ---------------------------------------------------------
function getMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const monthKey = getMonthKey();

// ---------------------------------------------------------
// SEND MESSAGE
// ---------------------------------------------------------
btnSend.addEventListener("click", async () => {
  const text = messageBox.value.trim();
  if (!text) return;

  const colRef = collection(db, `parentInbox/${monthKey}/entries`);
  const newMsg = await addDoc(colRef, {
    fromName: parentName || "Parent",
    body: text,
    createdAt: serverTimestamp(),
    unread: true,
    archived: false,
    deleted: false,
  });

  // Redirect to receipt
  window.location.href = `/para/parent/sent.html?id=${newMsg.id}&month=${monthKey}`;
});
// ------------------------------------------------------------
// PREVENT SECOND MESSAGE UNTIL COACH REPLIES
// ------------------------------------------------------------

async function parentCanSend(firstMsgId) {
  const now       = new Date();
  const y         = now.getFullYear();
  const m         = String(now.getMonth() + 1).padStart(2, "0");
  const monthKey  = `${y}-${m}`;

  const threadRef = collection(
    db,
    `parentInbox/${monthKey}/entries/${firstMsgId}/thread`
  );

  const snap = await getDocs(threadRef);

  // If no coach reply exists → BLOCK second message
  let coachHasReplied = false;

  snap.forEach(d => {
    const data = d.data();
    if (data.from === "coach") coachHasReplied = true;
  });

  return coachHasReplied;
}


// ------------------------------------------------------------
// SEND MESSAGE — WITH DOUBLE-SEND LOCK
// ------------------------------------------------------------

btnSend.addEventListener("click", async () => {
  const text = messageBox.value.trim();
  if (!text) return;

  const now       = new Date();
  const y         = now.getFullYear();
  const m         = String(now.getMonth() + 1).padStart(2, "0");
  const monthKey  = `${y}-${m}`;

  // Get the parent’s FIRST message (if any)
  const colRef = collection(db, `parentInbox/${monthKey}/entries`);
  const q      = query(colRef, where("parentUid", "==", parentUid), orderBy("createdAt", "asc"));
  const snaps  = await getDocs(q);

  if (!snaps.empty) {
    const firstMsgId = snaps.docs[0].id;

    const okToSend = await parentCanSend(firstMsgId);
    if (!okToSend) {
      alert("Please wait for the coach to reply before sending another message.");
      return;
    }
  }

  // ------------------------------------------
  // Write message (same as before)
  // ------------------------------------------
  const newMsg = await addDoc(colRef, {
    from: "parent",
    fromName: parentName,
    parentUid,
    body: text,
    unread: true,
    archived: false,
    deleted: false,
    createdAt: serverTimestamp()
  });

  messageBox.value = "";
  window.location.href = `/para/parent/sent.html?id=${newMsg.id}`;
});
