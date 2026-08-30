import type { Metadata } from "next";
import { JetBrains_Mono, Outfit } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const outfit = Outfit({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-outfit",
});

const jetbrainsMono = JetBrains_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Digraf",
  description: "Gestión interna de producción de Digraf",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${outfit.variable} ${jetbrainsMono.variable}`} lang="es">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
