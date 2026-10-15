import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ramp signs every webhook with an HMAC-SHA256 of the raw body, keyed with the
 * secret returned when the subscription was created, in the X-Ramp-Signature header.
 * The signature may come as plain hex or prefixed ("sha256=…").
 */
export function verifyRampSignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const given = header.trim().replace(/^sha256=/i, "");
  const hex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const b64 = Buffer.from(hex, "hex").toString("base64");
  for (const expected of [hex, b64]) {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export type RampEvent = { id: string; type: string; created_at?: string; business_id?: string; object?: { id?: string } | null; challenge?: string };
