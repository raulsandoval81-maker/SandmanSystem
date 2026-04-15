import { auth, db } from "/assets/js/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

function waitForUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user || null);
    });
  });
}

export async function requireAdmin() {
  try {
    const user = await waitForUser();

    console.log("[admin-guard] auth user:", user?.uid || null, user?.email || null);

    if (!user) {
      console.log("[admin-guard] not signed in");
      throw new Error("Not signed in.");
    }

    const staffRef = doc(db, "staff", user.uid);
    console.log("[admin-guard] checking staff doc:", `staff/${user.uid}`);

    const snap = await getDoc(staffRef);

    if (!snap.exists()) {
      console.log("[admin-guard] no staff profile");
      throw new Error("No staff profile found.");
    }

    const staff = snap.data() || {};
    const role = String(staff.role || "").trim().toLowerCase();
    const status = String(staff.status || "").trim().toLowerCase();

    console.log("[admin-guard] staff data:", { role, status, staff });

    if (role !== "admin") {
      console.log("[admin-guard] role is not admin");
      throw new Error("Admin access required.");
    }

    if (status !== "active") {
      console.log("[admin-guard] staff is not active");
      throw new Error("Admin profile is not active.");
    }

    const adminUser = {
      uid: user.uid,
      email: user.email || "",
      role,
      status
    };

    window.__adminUser = adminUser;
    console.log("[admin-guard] admin access granted:", adminUser);

    return adminUser;
  } catch (err) {
    console.error("[admin-guard] failed:", err);
    throw err;
  }
}