"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSesion } from "./SesionProvider";
import type { Rol } from "@/lib/tipos";

const ENLACES: Record<Rol, { href: string; texto: string }[]> = {
  reportante: [
    { href: "/reportante", texto: "Mis solicitudes" },
    { href: "/reportante/nuevo", texto: "Reportar problema" },
  ],
  tecnico: [{ href: "/tecnico", texto: "Mi cola de trabajo" }],
  manager: [{ href: "/manager", texto: "Panel operativo" }],
  admin: [
    { href: "/admin", texto: "Usuarios" },
    { href: "/admin/catalogos", texto: "Catálogos" },],
};

const NOMBRE_ROL: Record<Rol, string> = {
  reportante: "Reportante",
  tecnico: "Técnico",
  manager: "Coordinación",
  admin: "Administración",
};

export function Encabezado() {
  const { usuario, salir } = useSesion();
  const ruta = usePathname();

  return (
    <header className="border-b border-borde bg-white">
      <div className="bg-institucional">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-white">
          <div>
            <p className="text-sm font-semibold tracking-wide">Instituto Electoral del Estado de Querétaro</p>
            <p className="text-xs text-white/70">Sistema interno de soporte y atención de tickets</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-white/80">
              {usuario.nombre} · {NOMBRE_ROL[usuario.rol]}
            </span>
            <button onClick={salir} className="cursor-pointer underline underline-offset-2 hover:text-white/80">
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
      <nav className="mx-auto flex max-w-5xl gap-6 px-4">
        {ENLACES[usuario.rol].map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className={`border-b-2 py-3 text-sm ${
              ruta === e.href
                ? "border-institucional font-medium text-institucional"
                : "border-transparent text-suave hover:text-tinta"
            }`}
          >
            {e.texto}
          </Link>
        ))}
      </nav>
    </header>
  );
}