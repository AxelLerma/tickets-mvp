"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AccionesTicket } from "@/components/AccionesTicket";
import { Comentarios } from "@/components/Comentarios";
import { Evidencias } from "@/components/Evidencias";
import { Historial } from "@/components/Historial";
import { InsigniaEstado, Prioridad } from "@/components/Insignias";
import { PanelTecnico } from "@/components/PanelTecnico";
import { useSesion } from "@/components/SesionProvider";
import { useApi } from "@/lib/api";
import { ETIQUETAS_IMPACTO, fechaHora } from "@/lib/formato";
import { RUTA_INICIO } from "@/lib/roles";
import type { Detalle } from "@/lib/tipos";

export default function PaginaTicket() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useSesion();
  const { datos, error, cargando, recargar } = useApi<Detalle>(`/tickets/${id}`);

  return (
    <>
      <Link href={RUTA_INICIO[usuario.rol]} className="text-sm text-suave hover:text-tinta">
        ← Volver
      </Link>

      {error && <div className="alerta-error mt-4">{error}</div>}
      {cargando && <p className="mt-4 text-sm text-suave">Cargando…</p>}

      {datos && (
        <div className="mt-3 grid gap-6 lg:grid-cols-[19rem_1fr]">
          {/* Resumen fijo: el contexto del ticket siempre a la vista */}
          <aside className="panel self-start p-5 lg:sticky lg:top-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-suave">{datos.ticket.folio}</span>
              <InsigniaEstado estado={datos.ticket.estado} />
            </div>
            <h1 className="mt-2 text-lg font-semibold tracking-tight">{datos.ticket.titulo}</h1>
            <div className="mt-1">
              <Prioridad valor={datos.ticket.prioridad} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {(
                [
                  ["Categoría", datos.ticket.categoria],
                  ["Ubicación", `${datos.ticket.sede} · ${datos.ticket.area}`],
                  ["Equipo", datos.ticket.equipoActivo ?? "—"],
                  ["Impacto", ETIQUETAS_IMPACTO[datos.ticket.impacto]],
                  ["Reporta", datos.ticket.reportante],
                  ["Atiende", datos.ticket.tecnico ?? "Pendiente de asignación"],
                  ["Registrado", fechaHora(datos.ticket.creadoEn)],
                  ["Fecha objetivo", fechaHora(datos.ticket.fechaObjetivo)],
                ] as [string, string][]
              ).map(([etiqueta, valor]) => (
                <div key={etiqueta}>
                  <dt className="text-xs text-suave">{etiqueta}</dt>
                  <dd>{valor}</dd>
                </div>
              ))}
            </dl>
          </aside>

          <div className="min-w-0 space-y-6">
            <section className="panel p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-suave">Descripción del reporte</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{datos.ticket.descripcion}</p>
            </section>

            <Evidencias
              ticketId={datos.ticket.id}
              evidencias={datos.evidencias}
              etapasPermitidas={datos.acciones.etapasEvidencia}
              alCambiar={recargar}
            />

            {datos.tecnico && <PanelTecnico key={datos.ticket.estado} detalle={datos} tecnico={datos.tecnico} recargar={recargar} />}

            <AccionesTicket ticketId={datos.ticket.id} acciones={datos.acciones} recargar={recargar} />

            <Comentarios
              ticketId={datos.ticket.id}
              comentarios={datos.comentarios}
              puedeComentar={datos.acciones.comentar}
              recargar={recargar}
            />

            {datos.historial && <Historial eventos={datos.historial} />}
          </div>
        </div>
      )}
    </>
  );
}