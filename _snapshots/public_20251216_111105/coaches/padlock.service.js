// File: /public/coaches/padlock.service.js
// Purpose: Gate coach/admin tools behind Firebase Auth + custom claims.

// 1) Make sure Firebase App is initialized (your project’s init script).
import "../assets/js/firebase-init.js";

// 2) Pull Auth from Firebase (v9+ modular CDN).
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const auth = getAuth();
const els = {
  lock: document.getElementById("lockPanel"),
  priv: document.getElementById("privatePanel"),
  signInBtn: document.getElementById("signInBtn"),
};

const provider = new GoogleAuthProvider();
// Optional: lock to your org/domain later
// provider.setCustomParameters({ hd: "yourdomain.com" });

function showLocked(reason = "") {
  if (els.priv) els.priv.style.display = "none";
  if (els.lock) els.lock.style.display = "block";
  if (reason) console.info("[padlock] locked:", reason);
}

function showPrivate() {
  if (els.lock) els.lock.style.display = "none";
  if (els.priv) els.priv.style.display = "block";
}

async function hasCoachClaims(user) {
  try {
    const token = await user.getIdTokenResult(true);
    const claims = token.claims || {};
    // Our rule: either coach OR admin is enough
    return claims.coach === true || claims.admin === true;
  } catch (e) {
    console.warn("[padlock] claim check failed:", e);
    return false;
  }
}

// --- Auth state gate ---
onAuthStateChanged(auth, async (user) => {
  if (!user) return showLocked("no user");
  const ok = await hasCoachClaims(user);
  if (ok) showPrivate();
  else showLocked("missing coach/admin claim");
});

// --- UI: Sign In / Sign Out ---
if (els.signInBtn) {
  els.signInBtn.addEventListener("click", async () => {
    try {
      // TEMP: Google popup for coaches. Replace with redirect/SSO if needed.
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle panel toggle.
    } catch (e) {
      console.error("[padlock] sign-in failed:", e);
      alert("Sign-in failed. If this persists, contact an admin.");
    }
  });
}

// Optional: Expose a sign-out helper if you add a button inside #privatePanel later.
window.padlockSignOut = async () => {
  try {
    await signOut(auth);
    showLocked("signed out");
  } catch (e) {
    console.error("[padlock] sign-out failed:", e);
  }
};

/*
Wiring Notes
------------
1) Claims are set server-side (Admin SDK). Example (Node):
   await auth.setCustomUserClaims(uid, { coach: true }); // or { admin: true }

2) Firestore Rules should ALSO enforce claims:
   allow read: if true;
   allow write: if request.auth.token.coach == true || request.auth.token.admin == true;

3) If you prefer email link login:
   - Swap signInWithPopup for sendSignInLinkToEmail / isSignInWithEmailLink.

4) If you want domain-restricted Google SSO:
   provider.setCustomParameters({ hd: "yourdomain.com" });
*/
