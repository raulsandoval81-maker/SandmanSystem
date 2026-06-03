import {
  auth,
  db,
  ensureSignedIn,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";


export async function requireCoach() {
  await ensureSignedIn();

  const user = auth.currentUser;
  const uid = user?.uid || null;
  const email = String(user?.email || "").toLowerCase().trim();

  if (!uid) {
    bounce("/login.html");
  }

  // Primary check: coaches/{uid}
  try {
    const coachRef = doc(db, "coaches", uid);
    const coachSnap = await getDoc(coachRef);

    if (coachSnap.exists()) {
      const coach = coachSnap.data() || {};
      return {
        uid,
        email,
        coach
      };
    }
  } catch (err) {
    console.error("[coach-guard] coaches/{uid} check failed:", err);
  }

  // Fallback allowlist by email inside the file for now.
  // Replace these with your real coach emails.
  const ALLOWED_COACH_EMAILS = [
    "coachsandoval@gmail.com",
    "coachsandoval@whatever.com"
  ].map(x => x.toLowerCase());

  if (email && ALLOWED_COACH_EMAILS.includes(email)) {
    return {
      uid,
      email,
      coach: { role: "coach", source: "email-allowlist" }
    };
  }

  bounce("/index.html");
}