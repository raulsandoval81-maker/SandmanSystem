// /coaches/xp/arena/arena-receipts.js
// Receipts: per athlete + tournament, TTL in localStorage (12h default)

export const RECEIPT_TTL_MS =
  12 * 60 * 60 * 1000;

export const RECEIPT_KEY =
  "sandman_arena_receipts_v1";

export const IQ_TRAITS = Object.freeze({
  bull: "Pressure",
  matador: "Precision",
  snake: "Constriction",
  mongoose: "Scramble",
  gorilla: "Control",
  shark: "Hunt",
});

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function emptyTotals() {
  return {
    battle: 0,
    podium: 0,
    iq: 0,
    secondStyle: 0,
    sportsmanship: 0,
    prestige: 0,
  };
}

export function readReceipts() {
  const obj =
    safeParse(localStorage.getItem(RECEIPT_KEY));

  if (!obj || typeof obj !== "object") {
    return {};
  }

  const now =
    Date.now();

  for (const k of Object.keys(obj)) {
    const rec =
      obj[k];

    if (
      !rec ||
      typeof rec !== "object" ||
      (rec.expiresAt && rec.expiresAt < now)
    ) {
      delete obj[k];
    }
  }

  return obj;
}

export function writeReceipts(obj) {
  try {
    localStorage.setItem(
      RECEIPT_KEY,
      JSON.stringify(obj)
    );
  } catch {}
}

export function receiptId(uid, tournamentId) {
  return `${uid}__${tournamentId}`;
}

export function markReceipt({
  uid,
  tournamentId,
  kind,
  delta,
  style = null,
  prestigeLevel = null,
}) {
  const store =
    readReceipts();

  const id =
    receiptId(uid, tournamentId);

  const now =
    Date.now();

  const rec =
    store[id] || {
      uid,
      tournamentId,
      createdAt: now,
      expiresAt: now + RECEIPT_TTL_MS,
      totals: emptyTotals(),
      lastStyle: null,
      prestigeLevel: null,
    };

  rec.expiresAt =
    now + RECEIPT_TTL_MS;

  rec.totals = {
    ...emptyTotals(),
    ...(rec.totals || {}),
  };

  if (kind === "ARENA/BATTLE") {
    rec.totals.battle += delta;
  }

  if (kind === "ARENA/PODIUM") {
    rec.totals.podium += delta;
  }

  if (kind === "ARENA/STYLEIQ") {
    rec.totals.iq += delta;

    if (style) {
      rec.lastStyle = style;
    }
  }

  if (kind === "ARENA/SECOND_STYLE") {
    rec.totals.secondStyle += delta;
  }

  if (kind === "ARENA/SPORTSMANSHIP_DING") {
    rec.totals.sportsmanship += delta;
  }

  if (kind === "PRESTIGE") {
    rec.totals.prestige += delta;

    if (prestigeLevel) {
      rec.prestigeLevel = prestigeLevel;
    }
  }

  store[id] =
    rec;

  writeReceipts(store);
}

export function getReceiptSummary(uid, tournamentId) {
  const store =
    readReceipts();

  const rec =
    store[receiptId(uid, tournamentId)];

  if (!rec) return null;

  const t =
    rec.totals || {};

  const battle =
    Number(t.battle || 0);

  const podium =
    Number(t.podium || 0);

  const iq =
    Number(t.iq || 0);

  const secondStyle =
    Number(t.secondStyle || 0);

  const sportsmanship =
    Number(t.sportsmanship || 0);

  const prestige =
    Number(t.prestige || 0);

  const any =
    battle ||
    podium ||
    iq ||
    secondStyle ||
    sportsmanship ||
    prestige;

  if (!any) return null;

  return {
    battle,
    podium,
    iq,
    secondStyle,
    sportsmanship,
    prestige,
    style: rec.lastStyle || null,
    prestigeLevel: rec.prestigeLevel || null,
  };
}

export function makeReceiptBadge({
  uid,
  tournamentId,
}) {
  if (!uid || !tournamentId) return "";

  const sum =
    getReceiptSummary(uid, tournamentId);

  if (!sum) return "";

  const parts =
    [];

  if (sum.battle) {
    parts.push(`
      <span class="pilltag battle" title="Battle awarded within TTL">
        <span class="dot"></span>Battle +${sum.battle}
      </span>
    `);
  }

  if (sum.podium) {
    parts.push(`
      <span class="pilltag podium" title="Podium awarded within TTL">
        <span class="dot"></span>Podium +${sum.podium}
      </span>
    `);
  }

  if (sum.iq) {
    const s =
      String(sum.style || "").toLowerCase();

    const animal =
      s
        ? s.charAt(0).toUpperCase() + s.slice(1)
        : "IQ";

    const trait =
      s && IQ_TRAITS[s]
        ? IQ_TRAITS[s]
        : "";

    const label =
      trait
        ? `Match IQ +${sum.iq} · ${animal} — ${trait}`
        : `Match IQ +${sum.iq}`;

    parts.push(`
      <span class="pilltag iq" title="Match IQ awarded within TTL">
        <span class="dot"></span>${label}
      </span>
    `);
  }

  if (sum.secondStyle) {
    parts.push(`
      <span class="pilltag second-style" title="2nd Style/Division awarded within TTL">
        <span class="dot"></span>2nd Style +${sum.secondStyle}
      </span>
    `);
  }

  if (sum.sportsmanship) {
    parts.push(`
      <span class="pilltag sportsmanship" title="Sportsmanship Ding applied within TTL">
        <span class="dot"></span>Sportsmanship ${sum.sportsmanship}
      </span>
    `);
  }

  if (sum.prestige) {
    const lvl =
      sum.prestigeLevel
        ? ` · ${sum.prestigeLevel}`
        : "";

    parts.push(`
      <span class="pilltag prestige" title="Prestige awarded within TTL">
        <span class="dot"></span>Prestige +${sum.prestige}${lvl}
      </span>
    `);
  }

  return `
    <span class="badge-set">
      ${parts.join("")}
    </span>
  `;
}