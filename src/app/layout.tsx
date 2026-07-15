import type { Metadata } from "next";

import "./globals.css";

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
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
