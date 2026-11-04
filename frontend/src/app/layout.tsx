import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soporte interno · IEEQ",
  description: "Plataforma interna de operaciones y tickets",
};

const SCRIPT_TEMA = `try{var t=localStorage.getItem("tema");if(t==="oscuro"||(t!=="claro"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("oscuro")}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}