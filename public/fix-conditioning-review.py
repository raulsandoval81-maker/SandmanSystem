from pathlib import Path
import shutil
import sys

target = Path("public/coaches/lanes/conditioning/review.js")
backup = target.with_suffix(target.suffix + ".before-single-approve")

if not target.exists():
    print("ERROR:", target, "not found.")
    sys.exit(1)

text = target.read_text(encoding="utf-8")
original = text


# --------------------------------------------------------
# Replace buttons
# --------------------------------------------------------

old_buttons = r'''          <button
            data-act="approve"
            data-id="${esc(athleteId)}"
            data-key="${esc(key)}"
            style="${btnStyle("ok")}"
          >Approve</button>

          <button
            data-act="revision"
            data-id="${esc(athleteId)}"
            data-key="${esc(key)}"
            style="${btnStyle("danger")}"
          >Needs Revision</button>

          <span style="flex:1;"></span>

          <button
            data-act="xp5"
            data-id="${esc(athleteId)}"
            data-key="${esc(key)}"
            ${awardLocked ? "disabled data-award-locked" : ""}
            style="${btnStyle("brand")}opacity:${awardLocked ? ".4" : "1"};"
          >Award +5</button>'''

new_buttons = r'''          <button
            data-act="approve"
            data-id="${esc(athleteId)}"
            data-key="${esc(key)}"
            ${awardLocked ? "disabled data-award-locked" : ""}
            style="${btnStyle("brand")}opacity:${awardLocked ? ".4" : "1"};"
          >Approve (+5 XP)</button>

          <button
            data-act="revision"
            data-id="${esc(athleteId)}"
            data-key="${esc(key)}"
            style="${btnStyle("danger")}"
          >Needs Revision</button>'''

if old_buttons not in text:
    print("Couldn't find button block.")
    sys.exit(1)

text = text.replace(old_buttons, new_buttons, 1)


# --------------------------------------------------------
# Replace Approve handler
# --------------------------------------------------------

old_approve = r'''          if (act === "approve") {
            await writeLaneHistory({
              athleteId,
              athleteName: currentName,
              key,
              entry: {
                ...currentEntry,
                coachNote,
              },
              coachNote,
            });

            await patchSession({
              athleteId,
              key,
              patch: {
                status: "closed",
                coachNote,
                closedAt: serverTimestamp(),
              },
            });

            if (msgEl) msgEl.textContent = "Approved and archived.";
          }'''

new_approve = r'''          if (act === "approve") {

            const amt = 5;

            await awardXp({
              athleteId,
              amount: amt,
              note: coachNote || "Conditioning (+5)",
              meta: {
                lane: "conditioning",
                track: currentEntry?.track || "",
                segmentId: currentEntry?.segmentId || "segment1",
                sessionN,
                key,
              },
            });

            await writeLaneHistory({
              athleteId,
              athleteName: currentName,
              key,
              entry: {
                ...currentEntry,
                coachNote,
                awardedXp: amt,
              },
              coachNote,
            });

            await patchSession({
              athleteId,
              key,
              patch: {
                status: "closed",
                coachNote,
                awardedXp: amt,
                closedAt: serverTimestamp(),
              },
            });

            if (msgEl)
                msgEl.textContent = "Approved, awarded +5, and archived.";

          }'''

if old_approve not in text:
    print("Couldn't find approve handler.")
    sys.exit(1)

text = text.replace(old_approve, new_approve, 1)


# --------------------------------------------------------
# Remove Award +5 handler
# --------------------------------------------------------

start = text.find('if (act === "xp5")')

if start == -1:
    print("Couldn't find xp5 handler.")
    sys.exit(1)

brace = 0
end = None

for i in range(start, len(text)):
    if text[i] == "{":
        brace += 1
    elif text[i] == "}":
        brace -= 1
        if brace == 0:
            end = i + 1
            break

if end is None:
    print("Couldn't determine end of xp5 handler.")
    sys.exit(1)

text = text[:start] + text[end:]


# --------------------------------------------------------
# Save
# --------------------------------------------------------

shutil.copy2(target, backup)

target.write_text(text, encoding="utf-8")

print()
print("SUCCESS")
print()
print("Updated:", target)
print("Backup :", backup)
print()
print("Next:")
print("git diff -- public/coaches/lanes/conditioning/review.js")