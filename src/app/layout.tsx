import type { Metadata, Viewport } from "next";
import { Anybody, Lato } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Providers from "./providers";
import { I18nProvider } from "@/components/I18nProvider";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

// GMX Group typeface (brand guide): Lato for everything in the intranet.
const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-lato",
});

// Maximo's typeface, kept inside the Maximo tools (calculators, pricing, inventory).
const anybody = Anybody({
  subsets: ["latin"],
  variable: "--font-anybody",
});

// Parity with the legacy index.html viewport (maximum-scale=1).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "GMX Group Intranet",
  description: "GMX Group intranet — departments, tools and resources for Maximo, Lumber Plus and US4.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    // suppressHydrationWarning: browser extensions (e.g. Scribe) add attributes to <html>.
    <html lang={locale} className={`${lato.variable} ${anybody.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <I18nProvider locale={locale}>
        <Providers>
          <TooltipProvider>
            <Toaster />
            {children}
          </TooltipProvider>
        </Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
