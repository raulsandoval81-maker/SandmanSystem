export function buildRenderableCertificate(payload: any) {
  if (!payload?.printReady) return payload;

  return {
    ...payload,
    academyName: payload.academyName || "Lompoc Academy of Wrestling",
    coach: payload.coach || "Coach Sandoval",
    certificateVersion: "v1",
    renderedAt: new Date().toISOString()
  };
}