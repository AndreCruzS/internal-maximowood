"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";

const LOGO_WHITE = "/brand/gmx-logo-white.png";
const LOGO_COLOR = "/brand/gmx-logo-color.png";
const GREEN = "#009f67";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const supabase = getSupabase();
      if (!supabase) {
        setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(t.login.wrong);
        setPassword("");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError(t.login.unreachable);
    } finally {
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-bold text-gray-700">
                {t.login.email}
              </label>
              <Input
                id="email"
                type="email"
                placeholder="name@gmxgroup.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="h-12 text-base focus-visible:border-[#009f67] focus-visible:ring-[#009f67]/30"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-bold text-gray-700">
                {t.login.password}
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="h-12 text-base focus-visible:border-[#009f67] focus-visible:ring-[#009f67]/30"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full h-12 text-white font-bold text-base transition-all hover:opacity-90"
              style={{ background: GREEN }}
            >
              {isLoading ? t.login.signingIn : t.login.signIn}
            </Button>
          </form>

          <p className="mt-8 pt-6 border-t border-gray-100 text-xs text-gray-400 text-center">
            {t.login.footer}
          </p>
        </div>
      </div>
    </div>
  );
}
