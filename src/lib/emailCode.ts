/**
 * Sign-in with an emailed code, for company addresses that aren't on Google Workspace
 * (gflumber.com, Global LBM, is on Microsoft 365). Everyone else signs in with Google.
 */
export const CODE_LOGIN_DOMAINS = ["gflumber.com"] as const;

/** At most one code a minute and five an hour per address. */
export const CODE_COOLDOWN_SECONDS = 60;
export const CODE_HOURLY_MAX = 5;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function usesEmailCode(email: string) {
  const e = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+$/.test(e)) return false;
  return (CODE_LOGIN_DOMAINS as readonly string[]).includes(e.split("@")[1]);
}

/** Digits only, so "123 456" or "123-456" pasted from the email still works. */
export const cleanCode = (code: string) => code.replace(/\D/g, "");
export const isCodeShape = (code: string) => /^\d{6,10}$/.test(code);

/** Whether another code may be sent now, given when the earlier ones (last hour) went out. */
export function codeThrottle(sentAt: string[], now: Date): { ok: true } | { ok: false; retryAfter: number } {
  const times = sentAt.map(s => new Date(s).getTime()).filter(t => now.getTime() - t < 3_600_000);
  const last = Math.max(0, ...times);
  const wait = Math.ceil((last + CODE_COOLDOWN_SECONDS * 1000 - now.getTime()) / 1000);
  if (wait > 0) return { ok: false, retryAfter: wait };
  if (times.length >= CODE_HOURLY_MAX) {
    const oldest = Math.min(...times);
    return { ok: false, retryAfter: Math.ceil((oldest + 3_600_000 - now.getTime()) / 1000) };
  }
  return { ok: true };
}
