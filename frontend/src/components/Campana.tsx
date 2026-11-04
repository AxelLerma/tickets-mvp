"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { fechaHora } from "@/lib/formato";

interface Notificacion {
  id: number;
  ticketId: number | null;
  tipo: string;
  titulo: string;
  mensaje: string;
  creadaEn: string;
  leidaEn: string | null;
}

interface Respuesta {
  notificaciones: Notificacion[];
  sinLeer: number;
}

export function Campana() {
  const router = useRouter();
  const { datos, recargar } = useApi<Respuesta>("/notificaciones");
  const [abierta, setAbierta] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const recargarRef = useRef(recargar);

  useEffect(() => {
    recargarRef.current = recargar;
  });

  useEffect(() => {
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") recargarRef.current();
    }, 20000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (!abierta) return;
    const cerrarFuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener("mousedown", cerrarFuera);
    return () => document.removeEventListener("mousedown", cerrarFuera);
  }, [abierta]);

  async function abrir(n: Notificacion) {
    if (!n.leidaEn) await api(`/notificaciones/${n.id}/leer`, { method: "POST" }).catch(() => undefined);
    setAbierta(false);
    recargar();
    if (n.ticketId) router.push(`/tickets/${n.ticketId}`);
  }

  async function leerTodas() {
    await api("/notificaciones/leer-todas", { method: "POST" }).catch(() => undefined);
    recargar();
  }

  const sinLeer = datos?.sinLeer ?? 0;

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-label={`Notificaciones${sinLeer ? `, ${sinLeer} sin leer` : ""}`}
        className="relative cursor-pointer p-1.5 hover:text-white/80"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {sinLeer > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rosa px-1 text-[10px] font-semibold text-white">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </button>

      {abierta && (
        <div className="panel absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-1.5rem))] text-tinta">
          <div className="flex items-center justify-between border-b-2 border-borde px-4 py-2">
            <p className="text-sm font-semibold text-ciruela">Notificaciones</p>
            {sinLeer > 0 && (
              <button onClick={leerTodas} className="cursor-pointer text-xs text-institucional underline underline-offset-2">
                Marcar todas como leídas
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-borde overflow-y-auto">
            {(datos?.notificaciones.length ?? 0) === 0 && <li className="px-4 py-6 text-center text-sm text-suave">No tiene notificaciones.</li>}
            {datos?.notificaciones.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => abrir(n)}
                  className={`block w-full cursor-pointer px-4 py-3 text-left text-sm hover:bg-lavanda ${n.leidaEn ? "" : "bg-white"}`}
                >
                  <p className={n.leidaEn ? "text-suave" : "font-semibold"}>{n.titulo}</p>
                  <p className="mt-0.5 text-xs text-suave">{n.mensaje}</p>
                  <p className="mt-1 text-[11px] text-suave">{fechaHora(n.creadaEn)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}