// Read-only presentation adapter. Never mutates canonical practice or sends commands.
export function readClipboardPlan(root = document) {
  const blocks = [...root.querySelectorAll("#planBlocks .plan-block:not(.hidden)")].map(block => {
    const slot = String(block.dataset.slot || "");
    return {
      slot,
      title: block.querySelector(".block-title")?.textContent?.trim() || slot,
      minutes: Number(block.dataset.minutes || 0),
      notes: root.getElementById("notes-" + slot)?.value?.trim() || "",
      cards: [...block.querySelectorAll(".slot-cards [data-card-id]")].map(card =>
        card.textContent?.trim() || "").filter(Boolean)
    };
  }).filter(block => block.minutes > 0);
  return {
    focus: root.getElementById("slot-note")?.value?.trim() || "",
    blocks,
    allocatedMinutes: blocks.reduce((sum, block) => sum + block.minutes, 0)
  };
}

export function mountPrePracticePreview(root = document) {
  const editor = root.getElementById("clipboardEditorView");
  const previewButton = root.getElementById("clipboardPreviewView");
  const preview = root.getElementById("clipboardPracticePreview");
  if (!editor || !previewButton || !preview) return;
  const plan = root.getElementById("planBlocks");
  function showPreview() {
    const state = readClipboardPlan(root);
    preview.replaceChildren();
    const heading = root.createElement("h2");
    heading.textContent = "Practice Preview · " + state.allocatedMinutes + " planned minutes";
    preview.append(heading);
    const focus = root.createElement("p");
    focus.textContent = state.focus ? "Focus: " + state.focus : "No session focus entered";
    preview.append(focus);
    const list = root.createElement("ol");
    for (const block of state.blocks) {
      const item = root.createElement("li");
      const title = root.createElement("strong");
      title.textContent = block.title + " · " + block.minutes + " min";
      item.append(title);
      if (block.notes) {
        const notes = root.createElement("p");
        notes.textContent = block.notes;
        item.append(notes);
      }
      list.append(item);
    }
    preview.append(list);
    const disclaimer = root.createElement("p");
    disclaimer.textContent = "Preview only. This view does not save, accept, verify or launch a practice.";
    preview.append(disclaimer);
    preview.hidden = false;
    if (plan) plan.hidden = true;
    editor.setAttribute("aria-pressed", "false");
    previewButton.setAttribute("aria-pressed", "true");
  }
  function showEditor() {
    preview.hidden = true;
    if (plan) plan.hidden = false;
    editor.setAttribute("aria-pressed", "true");
    previewButton.setAttribute("aria-pressed", "false");
  }
  editor.addEventListener("click", showEditor);
  previewButton.addEventListener("click", showPreview);
}

if (typeof document !== "undefined") mountPrePracticePreview();
