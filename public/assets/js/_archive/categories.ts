// public/assets/js/categories.ts

/**
 * Sandman System — Category Mapping
 *
 * Backend (Firestore) uses plain keys:
 *   "attendance", "assignment", "tournament", "character_service", "leadership"
 *
 * Frontend displays stylized Sandman labels with underscores & numbers.
 */

export const CATEGORY_LABELS: Record<string, string> = {
  attendance: "_att3ndanc3",
  assignment: "_assignm3nt",
  tournament: "_t0urnam3nt",
  character_service: "_charact3r",
  leadership: "_lead3rship"
};

/**
 * Get display label from backend key
 */
export function getCategoryLabel(key: string): string {
  return CATEGORY_LABELS[key] || key;
}
