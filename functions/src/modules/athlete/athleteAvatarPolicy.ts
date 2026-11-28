export const AVATAR_STYLE_VERSION = "sandman-illustrated-v1";

const SHIRT_BY_RANK: Readonly<Record<string, string>> = Object.freeze({
  shadow: "white",
  prospect: "yellow",
  competitor: "orange",
  contender: "green",
  champion: "black",
  apprentice: "white",
  warrior: "blue",
  hero: "purple",
  veteran: "brown",
  legend: "black",
});

const GRAPPLING_PROGRAMS = new Set(["wrestling", "submission-grappling", "grappling"]);

export function avatarShirtColor(athlete: Record<string, any>): string {
  const rank = String(athlete.rankName || athlete.rank || "").trim().toLowerCase();
  const program = String(athlete.programKind || athlete.program || athlete.discipline || "")
    .trim().toLowerCase();
  const mapped = SHIRT_BY_RANK[rank] || String(athlete.rankColor || "gray").trim().toLowerCase();
  if ((rank === "shadow" || rank === "apprentice") && !GRAPPLING_PROGRAMS.has(program)) return "gray";
  return ["white", "gray", "yellow", "orange", "green", "black", "blue", "purple", "brown"]
    .includes(mapped) ? mapped : "gray";
}

export function avatarRequiresGuardian(athlete: Record<string, any>, athleteId: string): boolean {
  const markers = [athlete.trackBase, athlete.journey, athlete.framework, athlete.program, athlete.track]
    .map((value) => String(value || "").trim().toUpperCase());
  // Teen/adult journey names alone cannot establish legal adulthood.
  if (athleteId.toUpperCase().startsWith("F8_") || markers.some((value) =>
    ["F8", "YOUTH", "Z2H", "ZERO2HERO", "ROAD2CHAMPION", "FOUNDRY8", "FOUNDRY-8"].includes(value))) return true;
  // Only a server-held, valid ISO birth date can establish an adult exception.
  // Missing, malformed and underage records fail closed to guardian approval.
  const dob = athlete.dateOfBirth || athlete.birthDate || athlete.dob;
  if (typeof dob !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(dob)) return true;
  const date = new Date(dob + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dob) return true;
  const now = new Date();
  const adultDate = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  return date > adultDate;
}

export function validateAvatarRaster(mime: unknown, bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" {
  const normalized = String(mime || "").trim().toLowerCase();
  if (bytes.length < 32 || bytes.length > 2_500_000) throw new Error("INVALID_AVATAR_IMAGE_SIZE");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if ((normalized === "image/jpeg" && jpeg) || (normalized === "image/png" && png) ||
      (normalized === "image/webp" && webp)) return normalized;
  throw new Error("INVALID_AVATAR_IMAGE_TYPE");
}

// Fail closed: the former SVG embedded the entire source photograph as a data URL.
// A reviewed image-to-vector illustration renderer must replace this before
// photo drafts can be enabled. Do not persist disguised raster copies.
export function illustratedAvatarSvg(_mime: string, _bytes: Buffer): string {
  throw new Error("AVATAR_ILLUSTRATION_RENDERER_UNAVAILABLE");
}
