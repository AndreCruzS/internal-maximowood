import type { Metadata, Viewport } from "next";
import { Anybody } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Providers from "./providers";
import "./globals.css";

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
  title: "Maximo Sales Calculator",
  description: "Maximo Concierge sales team tool — calculator, inventory, pricing and B2B quotes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={anybody.variable}>
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
