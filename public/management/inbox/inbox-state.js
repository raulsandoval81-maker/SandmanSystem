const clean = (value) => String(value ?? "").trim().toUpperCase();

export function inboxView(message) {
  const status = clean(message.messageStatus || message.status);
  const stage = clean(message.routingStage);
  if (status === "CLOSED" || clean(message.status) === "CLOSED" || stage === "CLOSED") return "CLOSED";
  if (["ADMIN_GUIDANCE_REQUESTED", "COACH_ASSIGNED", "COACH_REVIEWING"].includes(stage)) return "WAITING";
  if (clean(message.topic) === "REQUEST-PASS") {
    if (clean(message.passPaymentStatus) === "PAID") return "ACTIVE";
    if (clean(message.passPaymentStatus) === "PENDING") return "WAITING";
    if (message.passAttendanceConfirmedAt) return "ACTIVE";
    return "ACTIVE";
  }
  if (status === "RESPONDED" || ["RESPONDED", "MANAGEMENT_RESPONDED"].includes(stage)) return "RESPONDED";
  return "ACTIVE";
}

export function passActionState(message) {
  const isPass = clean(message.topic) === "REQUEST-PASS";
  const supported = ["combat-dropin-1day", "combat-dropin-2day", "fitness-dropin"]
    .includes(String(message.passType ?? "").trim());
  const open = inboxView(message) !== "CLOSED";
  const attended = Boolean(message.passAttendanceConfirmedAt);
  const payment = clean(message.passPaymentStatus);
  return {
    confirmAttendance: isPass && supported && open && !attended,
    collectPayment: isPass && supported && open && attended && payment !== "PAID",
    close: open && (!isPass || (attended && payment === "PAID" && Boolean(message.stripePaymentIntentId))),
  };
}
