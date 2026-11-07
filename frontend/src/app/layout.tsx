import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import InstaladorPwa from "@/components/InstaladorPwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soporte interno · IEEQ",
  description: "Plataforma interna de operaciones y tickets",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#4b2377",
};

const SCRIPT_TEMA = `try{var t=localStorage.getItem("tema");if(t==="oscuro"||(t!=="claro"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("oscuro")}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        {children}
        <InstaladorPwa />
      </body>
    </html>
  );
}