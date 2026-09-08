export function readAthleteActivationContext(search = window.location.search) {
  const params = new URLSearchParams(search);
  return {
    athleteId: String(params.get("id") || params.get("uid") || "").trim().toUpperCase(),
    tokenId: String(params.get("token") || params.get("invite") || "").trim(),
    email: String(params.get("email") || "").trim().toLowerCase()
  };
}

export function assertCompleteAthleteActivationContext(context) {
  if (!context.athleteId || !context.tokenId || !context.email) {
    throw new Error("This Athlete invitation is incomplete. Ask Sandman Management for a new activation link.");
  }
  return context;
}

export function athleteActivationReturnUrl(context, origin = window.location.origin) {
  const url = new URL("/athletes/access/activate/", origin);
  url.searchParams.set("id", context.athleteId);
  url.searchParams.set("token", context.tokenId);
  url.searchParams.set("email", context.email);
  return url.toString();
}

export function athleteHomeUrl(athleteId) {
  return `/athletes/hub/?id=${encodeURIComponent(athleteId)}`;
}
