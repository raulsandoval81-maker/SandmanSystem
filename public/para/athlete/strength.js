import {
  db, ensureSignedIn,
  doc, collection, addDoc,
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

  const exercise = (document.getElementById("exercise").value || "").trim();
  const sets = Number(document.getElementById("sets").value || 0);
  const reps = Number(document.getElementById("reps").value || 0);
  const weight = Number(document.getElementById("weight").value || 0);
  const note = (document.getElementById("note").value || "").trim();

  if (!exercise || sets <= 0 || reps <= 0) {
    statusEl.textContent = "Need exercise + sets + reps.";
    return;
  }

  statusEl.textContent = "Saving…";

  const col = collection(db, "athletes", athleteUid, "strengthLogs");

  await addDoc(col, {
    mode: "reps_sets",
    exercise,
    sets,
    reps,
    weight,
    note,
    createdAt: serverTimestamp(),
    createdBy: "athlete" // or "coach"
  });

  statusEl.textContent = "Saved ✅";
  form.reset();
});