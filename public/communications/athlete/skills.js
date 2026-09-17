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

    const state =
      String(s.state || s.status || "NOT_INTRODUCED")
        .trim()
        .replaceAll("_", " ");

    const readiness =
      Number.isFinite(Number(s.readiness))
        ? `<div>Readiness: ${Number(s.readiness)}%</div>`
        : "";

    const review =
      s.needsReview === true
        ? `<div><strong>Needs Review</strong></div>`
        : "";

    html.push(`
      <div class="card">
        <strong>${s.name || s.familyId || doc.id}</strong>
        <div>Status: ${state}</div>
        ${review}
        ${readiness}
        <div>${s.coachNotes || ""}</div>
      </div>
    `);
  });

  container.innerHTML = html.join("");
}