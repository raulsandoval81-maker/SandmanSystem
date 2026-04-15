"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLabelKey = resolveLabelKey;
exports.getXpLabelByKey = getXpLabelByKey;
exports.getXpLabel = getXpLabel;
exports.getAllXpLabels = getAllXpLabels;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/* ---------------- load strategy ---------------- */
function tryLoadJson(p) {
    try {
        const raw = fs_1.default.readFileSync(p, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
const bundledPath = path_1.default.join(__dirname, "xp_labels.json");
const repoPath = path_1.default.resolve(__dirname, "../../REPO/config/xp_labels.json");
/* ---------------- defaults (Arena 10/5/5) ---------------- */
// ...keep imports & types as-is...
const FALLBACK = {
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
    tournament_show: { points: 10, label: "Arena — Battle", description: "Showed up and competed." },
    tournament_place: { points: 5, label: "Arena — Podium", description: "Earned placement." },
    tournament_style: { points: 5, label: "Arena — Style / Fight IQ", description: "Style/IQ recognition." }
};
// keep resolveLabelKey/getXpLabel(...) the same as we discussed
let LABELS = tryLoadJson(bundledPath) ??
    tryLoadJson(repoPath) ??
    FALLBACK;
/* Ensure required modern keys exist even if JSON overrides are partial */
const mustHave = [
    "attendance", "fish", "arena_battle", "arena_podium", "arena_styleiq"
];
for (const k of mustHave) {
    if (!LABELS[k])
        LABELS[k] = FALLBACK[k];
    const d = LABELS[k];
    if (typeof d.points !== "number" || typeof d.label !== "string" || typeof d.description !== "string") {
        LABELS[k] = FALLBACK[k];
    }
}
/* ---------- API ---------- */
/** Map various kinds/meta combos to a canonical label key */
function resolveLabelKey(kind, meta) {
    const k = String(kind || "").toUpperCase();
    if (k === "ATTENDANCE")
        return "attendance";
    if (k === "FISH")
        return "fish";
    // Old style:
    if (k === "TOURNAMENT") {
        const res = String(meta?.result || "SHOW").toUpperCase();
        if (res === "PLACE")
            return "tournament_place";
        if (res === "STYLE" || res === "STYLEIQ")
            return "tournament_style";
        return "tournament_show";
    }
    // New style:
    if (k === "ARENA/BATTLE")
        return "arena_battle";
    if (k === "ARENA/PODIUM")
        return "arena_podium";
    if (k === "ARENA/STYLEIQ" || k === "ARENA/STYLE")
        return "arena_styleiq";
    // Fallback to battle as neutral default
    return "arena_battle";
}
/** Get label def by key (canonical or legacy) */
function getXpLabelByKey(key) {
    return LABELS[key] ?? FALLBACK[key];
}
/** Shortcut: get label def from kind/meta (recommended) */
function getXpLabel(kind, meta) {
    return getXpLabelByKey(resolveLabelKey(kind, meta));
}
/** Optional: diagnostics */
function getAllXpLabels() { return LABELS; }
