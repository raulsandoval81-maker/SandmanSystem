// Minimal waiver “view gate” that flips the required switches without embeds.
export function initWaiver(){
  const openBtn   = document.getElementById("btn-open-waiver");
  const seenEl    = document.getElementById("waiver-seen");
  const chk       = document.getElementById("pi-waiver");
  const signEl    = document.getElementById("pi-sign");
  const dateEl    = document.getElementById("pi-sign-date");
  const submitBtn = document.getElementById("btn-pi-submit");

  if (!openBtn) return;

  openBtn.addEventListener("click", ()=>{
    // open your hosted PDF in a new tab
    window.open("/waiver-template.pdf", "_blank", "noopener");
    // unlock fields
    if (seenEl) { seenEl.textContent = "Viewed"; seenEl.classList.remove("warn"); seenEl.classList.add("ok"); }
    if (chk)    { chk.disabled = false; chk.focus(); }
    if (signEl) signEl.disabled = false;
    if (dateEl) dateEl.disabled = false;
  });

  // Enable submit when everything is acknowledged
  function updateSubmit(){
    const ok = chk?.checked && signEl?.value?.trim()?.length && dateEl?.value;
    if (submitBtn) submitBtn.disabled = !ok;
  }
  chk?.addEventListener("change", updateSubmit);
  signEl?.addEventListener("input", updateSubmit);
  dateEl?.addEventListener("change", updateSubmit);

  submitBtn?.addEventListener("click", ()=>{
    const status = document.getElementById("pi-status");
    if (status) status.textContent = "Submitting… (demo)";
    setTimeout(()=> status && (status.textContent = "Submitted (preview). Waiting for coach approval."), 600);
  });
}
