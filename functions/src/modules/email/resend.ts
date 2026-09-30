import { defineSecret } from "firebase-functions/params";
import { Resend } from "resend";

export const RESEND_API_KEY =
  defineSecret("RESEND_API_KEY");

export function getResendClient() {
  const key =
    RESEND_API_KEY.value();

  if (!key) {
    throw new Error("Missing RESEND_API_KEY secret");
  }

  return new Resend(key);
}
