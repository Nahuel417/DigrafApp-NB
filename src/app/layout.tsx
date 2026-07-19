import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});

const sourceCodePro = Source_Code_Pro({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-source-code-pro",
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
    <html className={`${inter.variable} ${sourceCodePro.variable}`} lang="es">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
