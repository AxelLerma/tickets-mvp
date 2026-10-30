import type { ReactNode } from "react";
import { Encabezado } from "@/components/Encabezado";
import { Guardia, SesionProvider } from "@/components/SesionProvider";

export default function LayoutApp({ children }: { children: ReactNode }) {
  return (
    <SesionProvider>
      <Encabezado />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Guardia>{children}</Guardia>
      </main>
    </SesionProvider>
  );
}