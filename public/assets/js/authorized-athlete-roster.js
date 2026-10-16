import {
  auth, collection, db, doc, getDoc, getDocs, limit, query, where
} from "/assets/js/firebase-init.js";
import { normalizeStaffContext } from "/assets/js/staff-context.js";

const MAX_ATHLETES = 500;

export async function getAuthorizedAthleteSnapshot() {
  const user = auth.currentUser;
  if (!user) throw new Error("Staff sign-in is required to load athletes.");
  const staffSnapshot = await getDoc(doc(db, "staff", user.uid));
  if (!staffSnapshot.exists()) throw new Error("An active staff profile is required.");
  const staff = normalizeStaffContext(staffSnapshot.data() || {});
  if (staff.status !== "active" || !["admin", "management", "coach"].includes(staff.role)) {
    throw new Error("Active Coach, Management, or Admin access is required.");
  }

  let docs = [];
  if (staff.role === "admin") {
    docs = (await getDocs(query(collection(db, "athletes"), limit(MAX_ATHLETES)))).docs;
  } else {
    const locations = [...new Set(staff.scope.locationIds)].filter(Boolean);
    if (!locations.length) return {docs: [], empty: true, size: 0, forEach() {}};
    const chunks = [];
    for (let index = 0; index < locations.length; index += 30) chunks.push(locations.slice(index, index + 30));
    const snapshots = await Promise.all(chunks.map((locationIds) => getDocs(query(
      collection(db, "athletes"), where("locationId", "in", locationIds), limit(MAX_ATHLETES)
    ))));
    const unique = new Map();
    snapshots.flatMap((snapshot) => snapshot.docs).forEach((athlete) => unique.set(athlete.id, athlete));
    docs = [...unique.values()];
  }
  return {docs, empty: docs.length === 0, size: docs.length, forEach(callback) { docs.forEach(callback); }};
}
