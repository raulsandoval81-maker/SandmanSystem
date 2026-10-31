/**
 * Keep client-review links and checkout return URLs inside the Firebase project
 * that created them. In particular, staging must never fall back to live Hosting.
 */
export function resolveBillingPublicBaseUrl(
  env: Record<string, string | undefined> = process.env
): string {
  let firebaseProject = "";
  if (env.FIREBASE_CONFIG) {
    try {
      firebaseProject = String(JSON.parse(env.FIREBASE_CONFIG).projectId || "");
    } catch {
      throw new Error("Invalid Firebase project configuration for Billing URLs.");
    }
  }

  const projectIds = [
    env.GCLOUD_PROJECT,
    env.GOOGLE_CLOUD_PROJECT,
    env.GCP_PROJECT,
    firebaseProject,
  ].filter((value): value is string => Boolean(value));
  const uniqueProjects = [...new Set(projectIds)];
  if (uniqueProjects.length !== 1) {
    throw new Error("Billing URL requires one verified Firebase project identity.");
  }

  const projectId = uniqueProjects[0];
  const allowedOrigins =
    projectId === "sandman-combat-staging"
      ? ["https://sandman-combat-staging.web.app"]
      : projectId === "sandmandashboard"
        ? ["https://sandmancombat.com", "https://www.sandmancombat.com"]
        : null;

  if (!allowedOrigins) {
    throw new Error("Billing URL project is not approved for client links.");
  }

  const configured = (env.SANDMAN_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured && !allowedOrigins.includes(configured)) {
    throw new Error("Billing URL origin does not match the Firebase project.");
  }

  return configured || allowedOrigins[0];
}
