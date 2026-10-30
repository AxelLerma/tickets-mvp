"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { InsigniaEstado, Prioridad } from "@/components/Insignias";
import { useSesion } from "@/components/SesionProvider";
import { useApi } from "@/lib/api";
import { ETIQUETAS_IMPACTO, fechaHora } from "@/lib/formato";
import { RUTA_INICIO } from "@/lib/roles";
import type { Ticket } from "@/lib/tipos";

export default function DetalleTicket() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useSesion();
  const { datos, error, cargando } = useApi<{ ticket: Ticket }>(`/tickets/${id}`);
  const ticket = datos?.ticket;

  const filas: [string, string][] = ticket
    ? [
        ["Categoría", ticket.categoria],
        ["Ubicación", `${ticket.sede} · ${ticket.area}`],
        ["Equipo", ticket.equipoActivo ?? "—"],
        ["Impacto", ETIQUETAS_IMPACTO[ticket.impacto]],
        ["Reportado por", ticket.reportante],
        ["Atiende", ticket.tecnico ?? "Pendiente de asignación"],
        ["Fecha de registro", fechaHora(ticket.creadoEn)],
        ["Fecha objetivo", fechaHora(ticket.fechaObjetivo)],
      ]
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={RUTA_INICIO[usuario.rol]} className="text-sm text-suave hover:text-tinta">
        ← Volver
      </Link>

      {error && <div className="alerta-error mt-4">{error}</div>}
      {cargando && <p className="mt-4 text-sm text-suave">Cargando…</p>}

      {ticket && (
        <article className="panel mt-3 p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm text-suave">{ticket.folio}</span>
            <InsigniaEstado estado={ticket.estado} />
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{ticket.titulo}</h1>
          <div className="mt-1">
            <Prioridad valor={ticket.prioridad} />
          </div>

          <dl className="mt-6 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            {filas.map(([etiqueta, valor]) => (
              <div key={etiqueta} className="contents">
                <dt className="text-suave">{etiqueta}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mt-6 text-sm font-semibold">Descripción</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{ticket.descripcion}</p>
        </article>
      )}
    </div>
  );
}