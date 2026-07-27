import * as functions from "firebase-functions";
import { Resend } from "resend";

export function getResendClient() {
  const key = functions.config().resend?.key;

  if (!key) {
    throw new Error("Missing Resend API key");
  }

  return new Resend(key);
}