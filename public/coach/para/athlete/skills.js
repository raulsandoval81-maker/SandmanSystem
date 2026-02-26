import {
  db,
  ensureSignedIn,
  collection,
  query,
  orderBy,
  getDocs
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

const params = new URLSearchParams(location.search);
const athleteId = params.get("id");

const container = document.getElementById("skills");

if (!athleteId) {
  container.innerHTML = "Missing athlete ID";
  throw new Error("Missing id");
}

const qRef = query(
  collection(db, "athletes", athleteId, "skills"),
  orderBy("name", "asc")
);

const snap = await getDocs(qRef);

if (snap.empty) {
  container.innerHTML = "<p>No skills yet.</p>";
} else {
  const html = [];
  snap.forEach(doc => {
    const s = doc.data();
    html.push(`
      <div class="card">
        <strong>${s.name}</strong>
        <div>Status: ${s.status}</div>
        <div>Readiness: ${s.readiness}%</div>
        <div>${s.coachNotes || ""}</div>
      </div>
    `);
  });

  container.innerHTML = html.join("");
}