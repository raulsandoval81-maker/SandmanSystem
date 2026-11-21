"""Build an offline-only Management XP candidate from pinned source bytes."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile

COMMIT = "8734b84762e6765bccf51cadbdf59c52434a7843"
BASELINE = {
    "bucket": "sandman-xp-recovery-889326401061",
    "object": "xp-recovery/original-xp-source.zip",
    "generation": "1795225849852373",
    "sha256": "ec8c60adea97dc837498926e4c8ac33782b6a717e672c6cae32170db79fe49a1",
}
MANAGEMENT = "lib/management/managementXpTools.js"
AUTHORITY = "lib/services/authoritativeXpService.js"
PINNED = {
    MANAGEMENT: "fee80c7d2f62e40626063c4cd4fb42a45f7a4a7e29108c7476e24aa0d0fe83fc",
    AUTHORITY: "08dea67eb31ddda852bd70fb5a8b08b509a9e58c040a38311394a59aeace35e7",
}
CALLABLE = b"exports.createManagementXpAdjustment = (0, https_1.onCall)(async (req) => {"
CLASSIFIER_START = b"const PROGRAM_MARKERS = {"
CLASSIFIER_END = b"function activeXpCap("
SHARED_CALL = b"(0, authoritativeXpService_1.classifyAthlete)(progression,"
LOCAL_CALL = b"classifyManagementAdjustmentProgram(progression,"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def split_once(contents, marker):
    require(contents.count(marker) == 1, "Unexpected source marker count")
    return contents.split(marker, 1)


def splice(original, approved, authority):
    prefix, _ = split_once(original, CALLABLE)
    _, handler = split_once(approved, CALLABLE)
    require(handler.rstrip().endswith(b"});") and b"\nexports." not in handler,
            "Approved callable is not the final export")
    require(handler.count(SHARED_CALL) == 1, "Unexpected classifier call")
    _, classifier = split_once(authority, CLASSIFIER_START)
    classifier, _ = split_once(classifier, CLASSIFIER_END)
    classifier = CLASSIFIER_START + classifier
    classifier = classifier.replace(b"function classifyAthlete(", b"function classifyManagementAdjustmentProgram(")
    require(classifier.count(b"function classifyManagementAdjustmentProgram(") == 1,
            "Unexpected classifier definition")
    require(b"PROGRAM_MARKERS" not in original and b"classifyManagementAdjustmentProgram" not in original,
            "Scoped classifier collides with baseline symbols")
    return prefix + CALLABLE + handler.replace(SHARED_CALL, LOCAL_CALL) + b"\n" + classifier


def entries(archive):
    contents = {}
    names = set()
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        require(sum(i.file_size for i in source.infolist()) <= 128 * 1024 * 1024,
                "Recovery ZIP exceeds the unpacked limit")
        for info in source.infolist():
            path = PurePosixPath(info.filename)
            require(not path.is_absolute() and ".." not in path.parts
                    and chr(92) not in info.filename and path.as_posix() == info.filename.rstrip("/")
                    and path not in names,
                    "Unsafe or duplicate ZIP entry")
            names.add(path)
            require(stat.S_IFMT(info.external_attr >> 16) in (0, stat.S_IFDIR, stat.S_IFREG),
                    "Unsupported ZIP entry type")
            if not info.is_dir():
                contents[info.filename] = source.read(info)
    return contents


def build(archive, approved):
    require(sha(archive) == BASELINE["sha256"], "Baseline archive hash mismatch")
    original = entries(archive)
    require(len(original) == 405, "Unexpected baseline inventory")
    require(all(sha(approved[name]) == expected for name, expected in PINNED.items()),
            "Approved compiled input hash mismatch")
    changed = splice(original[MANAGEMENT], approved[MANAGEMENT], approved[AUTHORITY])
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(archive)) as source, zipfile.ZipFile(buffer, "w") as output:
        for info in source.infolist():
            payload = changed if info.filename == MANAGEMENT else source.read(info)
            output.writestr(info, payload, compress_type=zipfile.ZIP_STORED)
    candidate = buffer.getvalue()
    require(entries(candidate) == {**original, MANAGEMENT: changed}, "Candidate archive entry drift")
    prefix, _ = split_once(original[MANAGEMENT], CALLABLE)
    require(split_once(changed, CALLABLE)[0] == prefix, "Experience validation prefix drift")
    report = {
        "status": "OFFLINE_CANDIDATE_ONLY",
        "deploymentEnabled": False,
        "baseline": BASELINE,
        "applicationCommit": COMMIT,
        "approvedInputs": PINNED,
        "proposedBuildEnvironment": {"GOOGLE_NODE_RUN_SCRIPTS": ""},
        "candidateSha256": sha(candidate),
        "changedEntries": {MANAGEMENT: {"before": sha(original[MANAGEMENT]), "after": sha(changed)}},
        "preservedManagementPrefixSha256": sha(prefix),
        "unchangedEntryCount": len(original) - 1,
        "retainedDependencyHashes": {p: sha(original[p]) for p in ("package.json", "package-lock.json", AUTHORITY)},
    }
    return candidate, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("approved_functions", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        candidate, report = build(args.baseline.read_bytes(), {
            name: (args.approved_functions / name).read_bytes() for name in PINNED
        })
        args.output.mkdir(mode=0o700, parents=False, exist_ok=False)
        (args.output / "candidate.zip").write_bytes(candidate)
        (args.output / "manifest.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, sort_keys=True))
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        raise SystemExit(f"STOP_NO_RETRY: {error}") from None


if __name__ == "__main__":
    main()
