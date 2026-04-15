import path from "path";
import fs from "fs";

/** Canonical keys (Arena model) */
export type CanonKey =
  | "attendance"        // +10
  | "fish"              // -5
  | "arena_battle"      // +10 (show up & compete)
  | "arena_podium"      // +5  (placement)
  | "arena_styleiq";    // +5  (style/fight IQ)

/** Legacy aliases we still recognize */
export type LegacyKey =
  | "tournament_show"
  | "tournament_place"
  | "tournament_style";

export type XpEventKey = CanonKey | LegacyKey;

export interface XpLabelDef {
  points: number;      // for UI reference only; backend must NOT trust this
  label: string;       // short name
  description: string; // coach/parent friendly text
}

export type XpLabelsMap = Record<XpEventKey, XpLabelDef>;

/* ---------------- load strategy ---------------- */
function tryLoadJson(p: string): XpLabelsMap | null {
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const bundledPath = path.join(__dirname, "xp_labels.json");
const repoPath = path.resolve(__dirname, "../../REPO/config/xp_labels.json");

/* ---------------- defaults (Arena 10/5/5) ---------------- */
// ...keep imports & types as-is...

const FALLBACK: XpLabelsMap = {
  attendance: {
    points: 10,
    label: "Daily Grind",
    description: "Full or Part-time Grind practice credit."
  },
  fish: {
    points: -5,
    label: "Coach Correction (Fish)",
    description: "Coach-only correction for a low-standard session."
  },

  // Arena (canonical)
  arena_battle: {
    points: 10,
    label: "Arena — Battle",
    description: "Showed up, weighed in, and competed."
  },
  arena_podium: {
    points: 5,
    label: "Arena — Podium",
    description: "Earned placement on the podium."
  },
  arena_styleiq: {
    points: 5,
    label: "Arena — Style / Fight IQ",
    description: "Tactical intelligence and expression under pressure."
  },

  // Legacy aliases (map to Arena wordings)
  tournament_show:  { points: 10, label: "Arena — Battle",      description: "Showed up and competed." },
  tournament_place: { points: 5,  label: "Arena — Podium",      description: "Earned placement." },
  tournament_style: { points: 5,  label: "Arena — Style / Fight IQ", description: "Style/IQ recognition." }
};

// keep resolveLabelKey/getXpLabel(...) the same as we discussed
let LABELS: XpLabelsMap =
  tryLoadJson(bundledPath) ??
  tryLoadJson(repoPath) ??
  FALLBACK;

/* Ensure required modern keys exist even if JSON overrides are partial */
const mustHave: CanonKey[] = [
  "attendance", "fish", "arena_battle", "arena_podium", "arena_styleiq"
];
for (const k of mustHave) {
  if (!LABELS[k]) LABELS[k] = FALLBACK[k];
  const d = LABELS[k];
  if (typeof d.points !== "number" || typeof d.label !== "string" || typeof d.description !== "string") {
    LABELS[k] = FALLBACK[k];
  }
}

/* ---------- API ---------- */

/** Map various kinds/meta combos to a canonical label key */
export function resolveLabelKey(kind: string, meta?: any): CanonKey | LegacyKey {
  const k = String(kind || "").toUpperCase();

  if (k === "ATTENDANCE") return "attendance";
  if (k === "FISH") return "fish";

  // Old style:
  if (k === "TOURNAMENT") {
    const res = String(meta?.result || "SHOW").toUpperCase();
    if (res === "PLACE") return "tournament_place";
    if (res === "STYLE" || res === "STYLEIQ") return "tournament_style";
    return "tournament_show";
  }

  // New style:
  if (k === "ARENA/BATTLE") return "arena_battle";
  if (k === "ARENA/PODIUM") return "arena_podium";
  if (k === "ARENA/STYLEIQ" || k === "ARENA/STYLE") return "arena_styleiq";

  // Fallback to battle as neutral default
  return "arena_battle";
}

/** Get label def by key (canonical or legacy) */
export function getXpLabelByKey(key: XpEventKey): XpLabelDef {
  return LABELS[key] ?? FALLBACK[key];
}

/** Shortcut: get label def from kind/meta (recommended) */
export function getXpLabel(kind: string, meta?: any): XpLabelDef {
  return getXpLabelByKey(resolveLabelKey(kind, meta));
}

/** Optional: diagnostics */
export function getAllXpLabels(): XpLabelsMap { return LABELS; }
