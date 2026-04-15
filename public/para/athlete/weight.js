import {
  db, ensureSignedIn,
  collection, addDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

const params = new URLSearchParams(location.search);
const athleteUid = (params.get("uid") || "").trim();
if (!athleteUid) throw new Error("Missing ?uid=");

const form = document.getElementById("form");
const statusEl = document.getElementById("status");

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const lbs = Number(document.getElementById("lbs").value || 0);
  const timeOfDay = (document.getElementById("timeOfDay").value || "AM").trim();
  const context = (document.getElementById("context").value || "unknown").trim();
  const note = (document.getElementById("note").value || "").trim();

  if (lbs <= 0) {
    statusEl.textContent = "Need weight in lbs.";
    return;
  }

  statusEl.textContent = "Saving…";

  const col = collection(db, "athletes", athleteUid, "weightLogs");

  await addDoc(col, {
    lbs,
    timeOfDay,
    context,
    note,
    takenAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    createdBy: "athlete"
  });

  statusEl.textContent = "Saved ✅";
  form.reset();
});