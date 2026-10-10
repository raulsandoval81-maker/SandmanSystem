export function assertSyntheticWriteSafety(snapshots, expectedPaths) {
  const expected = [...expectedPaths];
  if (snapshots.length !== expected.length) throw new Error("Firestore seed preflight did not inspect every intended path.");
  snapshots.forEach((snapshot, index) => {
    if (snapshot.ref.path !== expected[index]) throw new Error("Firestore seed preflight path ordering mismatch.");
    if (snapshot.exists && snapshot.get("synthetic") !== true && snapshot.get("syntheticDataOnly") !== true) {
      throw new Error(`Refusing to overwrite non-synthetic Firestore record ${snapshot.ref.path}.`);
    }
  });
}

export async function commitSyntheticManifestTransaction(db, writes, options = {}) {
  const entries = [...writes.entries()];
  const paths = entries.map(([path]) => path);
  if (!paths.length || new Set(paths).size !== paths.length) throw new Error("Synthetic manifest paths must be nonempty and unique.");
  return db.runTransaction(async transaction => {
    if (options.beforeRead) await options.beforeRead();
    const refs = paths.map(path => db.doc(path));
    const snapshots = await transaction.getAll(...refs);
    assertSyntheticWriteSafety(snapshots, paths);
    entries.forEach(([path, value], index) => transaction.set(refs[index], value, { merge: true }));
    return entries.length;
  });
}
