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
  return athleteId.toUpperCase().startsWith("F8_") || markers.some((value) =>
    ["F8", "YOUTH", "Z2H", "ZERO2HERO", "ROAD2CHAMPION", "FOUNDRY8", "FOUNDRY-8"].includes(value));
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

export function illustratedAvatarSvg(mime: string, bytes: Buffer): string {
  const encoded = bytes.toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="Sandman illustrated fighter avatar">
  <defs>
    <clipPath id="portrait"><path d="M155 90h490v510c0 115-110 175-245 175S155 715 155 600z"/></clipPath>
    <filter id="ink" color-interpolation-filters="sRGB"><feColorMatrix values="1.15 0 0 0 -.05 0 1.05 0 0 -.02 0 0 .92 0 .02 0 0 0 1 0"/><feComponentTransfer><feFuncR type="discrete" tableValues=".08 .24 .42 .62 .82 1"/><feFuncG type="discrete" tableValues=".06 .20 .38 .58 .78 .96"/><feFuncB type="discrete" tableValues=".05 .16 .30 .48 .68 .9"/></feComponentTransfer></filter>
    <linearGradient id="sand" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f6d66b"/><stop offset="1" stop-color="#a87216"/></linearGradient>
  </defs>
  <rect width="800" height="800" rx="96" fill="#101318"/>
  <circle cx="400" cy="360" r="305" fill="url(#sand)" opacity=".28"/>
  <g clip-path="url(#portrait)"><image href="data:${mime};base64,${encoded}" width="800" height="800" preserveAspectRatio="xMidYMid slice" filter="url(#ink)"/></g>
  <path d="M155 600c40 84 123 126 245 126s205-42 245-126" fill="none" stroke="#f6d66b" stroke-width="18"/>
  <path d="M178 116h444" stroke="#f6d66b" stroke-width="12" stroke-linecap="round"/>
  <text x="400" y="766" text-anchor="middle" fill="#f6d66b" font-family="system-ui,sans-serif" font-size="30" font-weight="800" letter-spacing="7">SANDMAN</text>
</svg>`;
}
