"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";

const LOGO_MW = "/logos/logo-mw-yellow.png";
const LOGO_THERMO = "/logos/logo-thermo-black.webp";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

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
        setError("Incorrect email or password. Please try again.");
        setPassword("");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center bg-black p-12 relative overflow-hidden">
        {/* Gold accent top bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#C9A227]" />

        {/* MW Logo large */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGO_MW}
          alt="Maximo M"
          className="w-48 h-auto mb-10 opacity-90"
        />

        <div className="text-center">
          <h2 className="text-white text-3xl font-black tracking-widest uppercase mb-2">
            Sales Calculator
          </h2>
          <p className="text-[#C9A227] text-sm font-medium tracking-widest uppercase">
            Concierge Team Tool
          </p>
        </div>

        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <p className="text-white/20 text-xs tracking-widest uppercase">
            Maximo Thermo · Internal Use Only
          </p>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8">
        {/* Mobile logo */}
        <div className="lg:hidden mb-10 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_MW} alt="Maximo" className="w-20 h-auto mx-auto mb-4" />
        </div>

        <div className="w-full max-w-sm">
          {/* Thermo logo */}
          <div className="mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO_THERMO}
              alt="Maximo Thermo"
              className="h-10 w-auto brightness-0 invert"
            />
          </div>

          <h1 className="text-white text-2xl font-bold mb-1">Welcome back</h1>
          <p className="text-white/50 text-sm mb-8">
            Sign in to access the sales tool.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-semibold text-white/80 uppercase tracking-wider">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="team@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#C9A227] focus:ring-[#C9A227] h-12 text-base"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-semibold text-white/80 uppercase tracking-wider">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#C9A227] focus:ring-[#C9A227] h-12 text-base"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-sm text-red-400">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full h-12 bg-[#C9A227] hover:bg-[#b8911f] text-black font-bold text-base uppercase tracking-wider transition-all"
            >
              {isLoading ? "Authenticating..." : "Access Tool"}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-xs text-white/20 text-center">
              Restricted access · Maximo Concierge Sales Team
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
