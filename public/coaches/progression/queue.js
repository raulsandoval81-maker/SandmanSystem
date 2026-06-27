import {
  db,
  collection,
  getDocs,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const cooldownList = document.getElementById("cooldownList");
const promotionList = document.getElementById("promotionList");
const freezeList = document.getElementById("freezeList");
const recentList = document.getElementById("recentList");

function getUid(docSnap, data = {}) {
  return data.uid || data.uidCode || docSnap.id;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

function fmtDate(value) {
  const d = toDate(value);
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function isCooldownExpired(a) {
  const until = toDate(a.testing?.cooldownUntil);
  if (!until) return false;
  return until.getTime() <= Date.now();
}

function isDevOrTestAthlete(a) {
  return (
    a.isDev === true ||
    a.isTest === true ||
    String(a._uid || "").toUpperCase().includes("TEST") ||
    String(a.publicName || a.fullName || "")
      .toUpperCase()
      .includes("DEV")
  );
}

function card(a) {
  const uid = a._uid || a.uid || a.uidCode || "UNKNOWN";

  return `
    <div class="card">
      <h3>${a.publicName || a.fullName || uid}</h3>

      <p>
        <strong>UID:</strong> ${uid}<br>
        <strong>Rank:</strong> ${a.rankName || a.tierName || a.tier || "—"}<br>
        <strong>State:</strong> ${a.testing?.state || "—"}<br>
        <strong>Cooldown:</strong> ${fmtDate(a.testing?.cooldownUntil)}<br>
        <strong>Freeze:</strong> ${fmtDate(a.testing?.freezeUntil)}
      </p>

      <a class="btn" href="/coaches/testing/coach-athlete-panel.html?id=${encodeURIComponent(uid)}">
        Open Athlete
      </a>
    </div>
  `;
}

function render(el, list, emptyText) {
  el.innerHTML = list.length
    ? list.map(card).join("")
    : `<div class="empty">${emptyText}</div>`;
}

function sortByName(list) {
  list.sort((a, b) =>
    (a.publicName || a.fullName || a._uid || "")
      .localeCompare(b.publicName || b.fullName || b._uid || "")
  );
}

async function load() {
  await ensureSignedIn();

  const snap = await getDocs(collection(db, "athletes"));

  const cooldown = [];
  const promote = [];
  const freeze = [];

  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};

    const a = {
      ...data,
      _uid: getUid(docSnap, data)
    };

    if (isDevOrTestAthlete(a)) {
      return;
    }

    const state = String(a.testing?.state || "").toUpperCase();

    if (state === "COOLDOWN") {
      if (isCooldownExpired(a)) {
        promote.push(a);
      } else {
        cooldown.push(a);
      }
      return;
    }

    if (state === "FREEZE") {
      freeze.push(a);
    }
  });

  sortByName(cooldown);
  sortByName(promote);
  sortByName(freeze);

  render(cooldownList, cooldown, "None in cooldown");
  render(promotionList, promote, "None ready to promote");
  render(freezeList, freeze, "None frozen");

  recentList.innerHTML = '<div class="empty">Coming Soon</div>';
}

load().catch((err) => {
  console.error(err);

  cooldownList.innerHTML = `<div class="empty">Load failed: ${err.message || err}</div>`;
  promotionList.innerHTML = `<div class="empty">Load failed</div>`;
  freezeList.innerHTML = `<div class="empty">Load failed</div>`;
});