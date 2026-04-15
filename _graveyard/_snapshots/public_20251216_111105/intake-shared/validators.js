const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(v) {
  return emailRe.test(String(v ?? "").trim());
}

export function validateEmail(v) {
  return isEmail(v);
}

export function validateUSPhone10(v) {
  return /^\d{10}$/.test(String(v ?? "").replace(/\D/g, ""));
}

export function required(v) {
  return String(v ?? "").trim().length > 0;
}

export function validateIntake(payload) {
  const errors = [];

  if (!validateEmail(payload.parentEmail)) errors.push("Valid email required");
  if (!required(payload.parentPhone)) errors.push("Phone required");
  if (!required(payload.athleteName)) errors.push("Athlete name required");
  if (!required(payload.dob)) errors.push("DOB required");
  if (!required(payload.city)) errors.push("City required");
  if (!required(payload.state)) errors.push("State required");
  if (!required(payload.emergency)) errors.push("Emergency contact required");

  return { ok: errors.length === 0, errors };
}
