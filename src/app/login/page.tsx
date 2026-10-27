"use client";

import { Button } from "@/components/ui/button";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { cleanCode, usesEmailCode } from "@/lib/emailCode";

const LOGO_WHITE = "/brand/gmx-logo-white.png";
const LOGO_COLOR = "/brand/gmx-logo-color.png";
const GREEN = "#009f67";

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" aria-hidden className="h-5 w-5">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const inputClass = "w-full h-12 rounded-md border border-gray-300 px-3 text-base text-gray-900 outline-none focus:border-[#009f67] focus:ring-2 focus:ring-[#009f67]/20";

/**
 * Company Google accounts: Google sends people to /auth/callback, which checks the domain.
 * gflumber.com (Global LBM, on Microsoft 365) signs in with a code emailed by /api/auth/email-code.
 */
function Login() {
  const { t } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const reason = params.get("error");
  const linkEmail = params.get("email") ?? "";
  const [error, setError] = useState(reason === "domain" ? t.login.notCompany : reason === "access" ? t.login.noAccess : reason ? t.login.failed : "");
  const [isLoading, setIsLoading] = useState(false);
  // Email-code sign-in: "google" (the default), "email" (type the address), "code" (type the code).
  const [step, setStep] = useState<"google" | "email" | "code">(usesEmailCode(linkEmail) ? "code" : "google");
  const [email, setEmail] = useState(usesEmailCode(linkEmail) ? linkEmail : "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(usesEmailCode(linkEmail) ? linkEmail : "");

  const post = async (path: string, body: object) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, ...((await res.json().catch(() => ({}))) as { error?: string; retryAfter?: number }) };
  };

  const sendCode = async (address: string) => {
    setError("");
    if (!usesEmailCode(address)) { setError(t.login.notCodeDomain); return; }
    const to = address.trim().toLowerCase();
    setBusy(true);
    try {
      const r = await post("/api/auth/email-code", { email: to });
      if (r.ok) { setSentTo(to); setCode(""); setStep("code"); }
      else if (r.error === "too_soon") { setError(t.login.tooSoon.replace("{n}", String(r.retryAfter ?? 60))); setSentTo(to); setStep("code"); }
      else setError(r.error === "not_code_domain" ? t.login.notCodeDomain : t.login.sendFailed);
    } catch {
      setError(t.login.unreachable);
    }
    setBusy(false);
  };

  const verify = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await post("/api/auth/verify-code", { email: sentTo, code });
      if (r.ok) { router.replace("/"); router.refresh(); return; }
      setError(r.error === "not_code_domain" ? t.login.notCodeDomain : r.error === "wrong_code" ? t.login.wrongCode : r.error === "access" ? t.login.noAccess : t.login.failed);
    } catch {
      setError(t.login.unreachable);
    }
    setBusy(false);
  };

  const signIn = async () => {
    setError("");
    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    setIsLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    // On success the browser is already on its way to Google.
    if (oauthError) {
      setError(t.login.unreachable);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left panel — GMX brand */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, #00704a 0%, ${GREEN} 100%)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/gmx-symbol.png" alt="" aria-hidden className="pointer-events-none absolute -right-24 top-1/2 -translate-y-1/2 h-[520px] w-[520px] opacity-10 brightness-0 invert" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_WHITE} alt="GMX Group" className="h-12 w-auto self-start" />
        <div className="relative">
          <h2 className="text-4xl font-black leading-tight">{t.login.intranet}</h2>
          <p className="mt-3 max-w-sm text-lg text-white/85">{t.login.tagline}</p>
        </div>
        <p className="text-xs uppercase tracking-widest text-white/60">Maximo · Lumber Plus · US4 · Builder Express</p>
      </div>

      {/* Right panel — login form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_COLOR} alt="GMX Group" className="h-10 w-auto" />
          </div>

          <h1 className="text-gray-900 text-3xl font-black mb-1">{t.login.welcome}</h1>
          <p className="text-gray-500 text-sm mb-8">{t.login.subtitle}</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          {step === "google" && (
            <>
              <Button
                type="button"
                onClick={signIn}
                disabled={isLoading}
                className="w-full h-12 gap-3 border border-gray-300 bg-white text-gray-800 font-bold text-base shadow-sm transition-all hover:bg-gray-50 hover:border-[#009f67]"
              >
                <GoogleMark />
                {isLoading ? t.login.signingIn : t.login.signIn}
              </Button>
              <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-gray-400">
                <span className="h-px flex-1 bg-gray-200" />{t.login.or}<span className="h-px flex-1 bg-gray-200" />
              </div>
              <button
                type="button"
                onClick={() => { setError(""); setStep("email"); }}
                className="w-full text-center text-sm font-semibold text-[#00704a] hover:underline"
              >
                {t.login.codeOpen}
              </button>
            </>
          )}

          {step === "email" && (
            <form onSubmit={e => { e.preventDefault(); void sendCode(email); }} className="space-y-3">
              <p className="text-sm font-bold text-gray-900">{t.login.codeTitle}</p>
              <label className="block text-sm text-gray-600">
                {t.login.codeEmail}
                <input
                  type="email" autoComplete="email" autoFocus required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="name@gflumber.com" className={`mt-1 ${inputClass}`}
                />
              </label>
              <Button type="submit" disabled={busy || !email.trim()} className="w-full h-12 bg-[#009f67] text-white font-bold text-base hover:bg-[#00704a]">
                {busy ? t.login.sending : t.login.sendCode}
              </Button>
              <button type="button" onClick={() => { setError(""); setStep("google"); }} className="w-full text-center text-sm text-gray-500 hover:underline">
                {t.login.backToGoogle}
              </button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={e => { e.preventDefault(); void verify(); }} className="space-y-3">
              <p className="text-sm text-gray-600">{t.login.codeSent.replace("{email}", sentTo)}</p>
              <label className="block text-sm text-gray-600">
                {t.login.code}
                <input
                  inputMode="numeric" autoComplete="one-time-code" autoFocus required value={code}
                  onChange={e => setCode(cleanCode(e.target.value).slice(0, 10))}
                  className={`mt-1 ${inputClass} text-center text-2xl font-bold tracking-[0.4em]`}
                />
              </label>
              <Button type="submit" disabled={busy || code.length < 6} className="w-full h-12 bg-[#009f67] text-white font-bold text-base hover:bg-[#00704a]">
                {busy ? t.login.verifying : t.login.verify}
              </Button>
              <div className="flex justify-between text-sm">
                <button type="button" disabled={busy} onClick={() => void sendCode(sentTo)} className="text-[#00704a] font-semibold hover:underline">
                  {t.login.resend}
                </button>
                <button type="button" onClick={() => { setError(""); setCode(""); setStep("email"); }} className="text-gray-500 hover:underline">
                  {t.login.otherEmail}
                </button>
              </div>
            </form>
          )}

          <p className="mt-8 pt-6 border-t border-gray-100 text-xs text-gray-400 text-center">
            {t.login.footer}
          </p>
        </div>
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary for the static build.
export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
