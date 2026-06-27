import { EngineAthlete } from "../athlete-engine/athleteNormalizer";
import { buildCertificatePayload } from "./certificatePayloadEngine";
import { buildRenderableCertificate } from "./certificateRenderer";

export function generateCertificateFromAthlete(athlete: EngineAthlete): any {
  const payload = buildCertificatePayload(athlete);

  if (!payload.printReady) {
    return payload;
  }

  return buildRenderableCertificate(payload);
}