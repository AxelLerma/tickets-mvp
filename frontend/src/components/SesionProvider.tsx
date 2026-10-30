"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { permitidoEn, RUTA_INICIO } from "@/lib/roles";
import type { Usuario } from "@/lib/tipos";

interface ContextoSesion {
  usuario: Usuario;
  salir: () => Promise<void>;
}

const SesionContext = createContext<ContextoSesion | null>(null);

export function useSesion(): ContextoSesion {
  const contexto = useContext(SesionContext);
  if (!contexto) throw new Error("useSesion debe usarse dentro de SesionProvider");
  return contexto;
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  useEffect(() => {
    api<{ usuario: Usuario }>("/auth/me")
      .then((r) => setUsuario(r.usuario))
      .catch(() => router.replace("/login"));
  }, [router]);

  async function salir() {
    await api("/auth/logout", { method: "POST" });
    setUsuario(null);
    router.replace("/login");
  }

  if (!usuario) {
    return <p className="p-8 text-sm text-suave">Cargando…</p>;
  }
  return <SesionContext.Provider value={{ usuario, salir }}>{children}</SesionContext.Provider>;
}

/** Redirige al inicio del rol si la persona entra a una sección que no le corresponde. */
export function Guardia({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  const ruta = usePathname();
  const router = useRouter();
  const permitido = permitidoEn(ruta, usuario.rol);

  useEffect(() => {
    if (!permitido) router.replace(RUTA_INICIO[usuario.rol]);
  }, [permitido, router, usuario.rol]);

  return permitido ? <>{children}</> : null;
}