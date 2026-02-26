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

  const mood = document.getElementById("mood").value;
  const stress = Number(document.getElementById("stress").value || 3);
  const sleep = Number(document.getElementById("sleep").value || 3);
  const focus = Number(document.getElementById("focus").value || 3);
  const effort = Number(document.getElementById("effort").value || 3);
  const attitude = Number(document.getElementById("attitude").value || 3);
  const respect = Number(document.getElementById("respect").value || 3);
  const note = (document.getElementById("note").value || "").trim();

  statusEl.textContent = "Saving…";

  const col = collection(db, "athletes", athleteUid, "mindsetLogs");

  await addDoc(col, {
    mood,
    stress, sleep,
    focus, effort, attitude, respect,
    note,
    createdAt: serverTimestamp(),
    createdBy: "athlete"
  });

  statusEl.textContent = "Saved ✅";
  form.reset();
});