import type { Metadata, Viewport } from "next";
import { Anybody, Lato } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Providers from "./providers";
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
  description: "GMX Group intranet — departments, tools and resources for Maximo, Lumber Plus and US4Pro.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. Scribe) add attributes to <html>.
    <html lang="en" className={`${lato.variable} ${anybody.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          <TooltipProvider>
            <Toaster />
            {children}
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
