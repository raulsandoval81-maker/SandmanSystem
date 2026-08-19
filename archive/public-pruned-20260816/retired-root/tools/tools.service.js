// /public/tools/tools.service.js
import { wireContactForm } from "../services/contact.service.js";
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  if (form) wireContactForm(form);
});
