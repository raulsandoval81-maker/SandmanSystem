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
