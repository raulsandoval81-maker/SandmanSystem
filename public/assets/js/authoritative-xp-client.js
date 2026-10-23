import { XP_URL } from "/assets/js/coach-endpoints.js";
import { requireCoach } from "/assets/js/coach-guard.js";

export class AuthoritativeXpRequestError extends Error {
  constructor(message, { status = 0, code = "XP_REQUEST_REJECTED", response = null } = {}) {
    super(message);
    this.name = "AuthoritativeXpRequestError";
    this.status = status;
    this.code = code;
    this.response = response;
  }
}

function unwrapFunctionResponse(value) {
  return value?.result || value?.data || value || {};
}

export async function postAuthoritativeXp(payload) {
  if (!payload?.uid) throw new AuthoritativeXpRequestError("XP request is missing athlete uid.");
  if (!payload?.kind) throw new AuthoritativeXpRequestError("XP request is missing award kind.");

  const access = await requireCoach();
  const user = access?.user;
  if (!user || user.isAnonymous) {
    throw new AuthoritativeXpRequestError("Active Coach authentication required.", {
      status: 401,
      code: "UNAUTHENTICATED",
    });
  }

  const token = await user.getIdToken();
  const response = await fetch(XP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data: payload }),
  });

  const text = await response.text().catch(() => "");
  let envelope = {};
  try {
    envelope = text ? JSON.parse(text) : {};
  } catch {
    // Preserve the HTTP status and raw response in the normalized error below.
  }
  const data = unwrapFunctionResponse(envelope);

  if (!response.ok || !data?.ok) {
    const message = data?.message || data?.error?.message || data?.error ||
      (text ? text.slice(0, 240) : `XP request rejected with HTTP ${response.status}.`);
    throw new AuthoritativeXpRequestError(String(message), {
      status: response.status,
      code: String(data?.code || data?.error?.status || "XP_REQUEST_REJECTED"),
      response: data,
    });
  }

  return data;
}
