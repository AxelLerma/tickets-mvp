"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { fechaHora } from "@/lib/formato";
import type { Ticket } from "@/lib/tipos";
import { InsigniaEstado } from "@/components/Insignias";

export default function MisSolicitudes() {
  const { datos, error, cargando } = useApi<{ tickets: Ticket[] }>("/tickets/mios");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Mis solicitudes</h1>
        <Link href="/reportante/nuevo" className="boton">
          Reportar problema
        </Link>
      </div>

      {error && <div className="alerta-error">{error}</div>}
      {cargando && <p className="text-sm text-suave">Cargando…</p>}
      {datos && datos.tickets.length === 0 && (
        <p className="panel p-6 text-center text-sm text-suave">Aún no se ha registrado ninguna solicitud.</p>
      )}

      {datos && datos.tickets.length > 0 && (
        <ul className="panel divide-y divide-borde">
          {datos.tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/tickets/${t.id}`} className="block px-4 py-4 hover:bg-fondo">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-suave">{t.folio}</span>
                  <InsigniaEstado estado={t.estado} />
                </div>
                <p className="mt-1 font-medium">{t.titulo}</p>
                <p className="text-sm text-suave">
                  {t.sede} · {fechaHora(t.creadoEn)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}