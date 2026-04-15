import {
  collection,
  getDocs,
  doc,
  updateDoc,
  orderBy,
  query,
  serverTimestamp,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

import { db } from "/assets/js/firebase-init.js";

const listEl = document.getElementById("list");

function normalizeStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "reviewing" || s === "assigned" || s === "closed") return s;
  return "new";
}

function askCoachNote(status, current = "") {
  const label =
    status === "reviewing" ? "Add review note:" :
    status === "assigned" ? "Add assignment note:" :
    status === "closed" ? "Add closing note:" :
    "Add note:";

  return window.prompt(label, current || "") ?? null;
}

function renderSection(title, items) {
  const section = document.createElement("div");
  section.className = "section-block";

  const heading = document.createElement("h2");
  heading.textContent = `${title} (${items.length})`;
  heading.style.margin = "18px 0 10px";
  heading.style.fontSize = "20px";
  section.appendChild(heading);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.textContent = `No ${title.toLowerCase()} requests.`;
    section.appendChild(empty);
    return section;
  }

  items.forEach(({ id, d }) => {
    const card = document.createElement("div");
    card.className = "card";

const threadText = d.threadId
  ? `<div class="row">
       <span class="label">Thread:</span>
       <a href="/para/parent/thread.html?id=${d.threadId}" style="color:#f4d44d; font-weight:600;">
         Open Thread
       </a>
     </div>`
  : "";
    card.innerHTML = `
      <div class="row"><span class="label">Name:</span>${d.parentName || d.name || ""}</div>
      <div class="row"><span class="label">Athlete:</span>${d.athleteName || d.athlete || ""}</div>
      <div class="row"><span class="label">Email:</span>${d.email || ""}</div>
      <div class="row"><span class="label">Phone:</span>${d.phone || ""}</div>
      <div class="row"><span class="label">Language:</span>${d.preferredLanguage || ""}</div>
      <div class="row"><span class="label">Help:</span>${(d.helpAreas || []).join(", ")}</div>
      <div class="row"><span class="label">Notes:</span>${d.notes || ""}</div>
      <div class="row"><span class="label">Coach:</span>${d.coachNote || ""}</div>
      <div class="row"><span class="label">Status:</span><span class="status">${normalizeStatus(d.status)}</span></div>
      ${threadText}

      <button class="btn reviewing">Reviewing</button>
      <button class="btn assigned">Assign</button>
      <button class="btn closed">Close</button>
    `;

    const [btnReview, btnAssign, btnClose] = card.querySelectorAll("button");

    btnReview.onclick = () => updateStatus(id, "reviewing", d);
    btnAssign.onclick = () => updateStatus(id, "assigned", d);
    btnClose.onclick = () => updateStatus(id, "closed", d);

    section.appendChild(card);
  });

  return section;
}

async function loadInbox() {
  listEl.innerHTML = "Loading...";

  const q = query(
    collection(db, "parentVolunteerSubmissions"),
    orderBy("submittedAt", "desc")
  );

  const snap = await getDocs(q);

  const buckets = {
    new: [],
    reviewing: [],
    assigned: [],
    closed: []
  };

  snap.forEach((docSnap) => {
    const d = docSnap.data();
    const id = docSnap.id;
    const status = normalizeStatus(d.status);

    buckets[status].push({ id, d });
  });

  listEl.innerHTML = "";
  listEl.appendChild(renderSection("New", buckets.new));
  listEl.appendChild(renderSection("Reviewing", buckets.reviewing));
  listEl.appendChild(renderSection("Assigned", buckets.assigned));
  listEl.appendChild(renderSection("Closed", buckets.closed));
}

async function createVolunteerThread(submissionId, d, coachNote) {
  if (d.threadId) return d.threadId;

  const threadRoot = await addDoc(collection(db, "paraVolunteerInbox"), {
    parentUid: d.parentUid || null,
    parentEmail: d.email || "",
    parentName: d.parentName || d.name || "",
    athlete: d.athleteName || d.athlete || "",
    subject: `Volunteer: ${d.type || "Support"}`,
    status: "open",
    source: "parent-volunteer-form",
    linkedVolunteerId: submissionId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    coachHasUnread: false,
    parentHasUnread: true,
    seenByCoach: true,
    seenByParent: false
  });

  const threadId = threadRoot.id;

  await addDoc(collection(db, "paraVolunteerInbox", threadId, "thread"), {
    from: "coach",
    fromName: "Coach",
    body: `Thanks for volunteering. We’d like to assign you to ${coachNote || "support this event"}.`,
    createdAt: serverTimestamp(),
    seenByCoach: true,
    seenByParent: false
  });

  return threadId;
}

async function updateStatus(id, status, currentData = {}) {
  const note = askCoachNote(status, currentData.coachNote || "");
  if (note === null) return;

  const ref = doc(db, "parentVolunteerSubmissions", id);

  const patch = {
    status,
    coachNote: note.trim(),
    updatedAt: serverTimestamp()
  };

  if (status === "closed") {
    patch.closedAt = serverTimestamp();
  }

  if (status === "assigned") {
    const threadId = await createVolunteerThread(id, currentData, note.trim());
    patch.threadId = threadId;
  }

  await updateDoc(ref, patch);

  console.log("UPDATED:", id, status);
  await loadInbox();
}

loadInbox();