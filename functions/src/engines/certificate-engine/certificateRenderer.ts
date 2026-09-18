export function buildRenderableCertificate(payload: any) {
  if (!payload?.printReady) return payload;

  return {
    ...payload,
    academyName: payload.academyName || "Sandman Combat",
    coach: payload.coach || "Coach Sandoval",
    certificateVersion: "v1",
    renderedAt: new Date().toISOString()
  };
}