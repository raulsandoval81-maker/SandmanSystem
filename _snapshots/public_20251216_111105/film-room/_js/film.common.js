// ==============================
// Sandman Film-Room Shared Library
// ==============================

// DOM helper
export function qs(sel, parent=document){
  return parent.querySelector(sel);
}

export function qsa(sel, parent=document){
  return [...parent.querySelectorAll(sel)];
}

// Panel loader (placeholder logic)
export function loadPanelMessage(id, msg){
  const el = qs(id);
  if (el){
    el.textContent = msg;
  }
}

// Stub: Load athlete profile later
export async function loadAthleteProfile(uid){
  console.log("loadAthleteProfile() stub — uid:", uid);
  return { uid, name: "Unknown Athlete" };
}

// Stub: Load video list
export async function loadVideoList(category){
  console.log("loadVideoList() stub — category:", category);
  return [];
}
