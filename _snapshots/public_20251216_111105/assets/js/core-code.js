import { toast } from "../services/core.service.js";
// import { guardAdmin } from "../services/admin.service.js"; // (future)

document.addEventListener("DOMContentLoaded", () => {
  // guardAdmin(); // later: Firebase role check
  toast("Admin hub ready", "info");
});
