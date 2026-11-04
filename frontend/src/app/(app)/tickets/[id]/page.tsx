"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { AccionesTicket } from "@/components/AccionesTicket";
import { Comentarios } from "@/components/Comentarios";
import { Evidencias } from "@/components/Evidencias";
import { Historial } from "@/components/Historial";
import { InsigniaEstado, Prioridad } from "@/components/Insignias";
import { PanelTecnico } from "@/components/PanelTecnico";
import { Relacionados } from "@/components/Relacionados";
import { useSesion } from "@/components/SesionProvider";
import { useApi } from "@/lib/api";
import { ETIQUETAS_IMPACTO, fechaHora } from "@/lib/formato";
import { RUTA_INICIO } from "@/lib/roles";
import type { Detalle } from "@/lib/tipos";

export default function PaginaTicket() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useSesion();
  const { datos, error, cargando, recargar } = useApi<Detalle>(`/tickets/${id}`);

  const recargarRef = useRef(recargar);
  useEffect(() => {
    recargarRef.current = recargar;
  });
  useEffect(() => {
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") recargarRef.current();
    }, 15000);
    return () => clearInterval(intervalo);
  }, []);

  const t = datos?.ticket;
  const esPersonal = usuario.rol === "tecnico" || usuario.rol === "manager";

  return (
    <>
      <Link href={RUTA_INICIO[usuario.rol]} className="text-sm text-suave hover:text-tinta">
        ← Volver
      </Link>

      {error && <div className="alerta-error mt-4">{error}</div>}
      {cargando && <p className="mt-4 text-sm text-suave">Cargando…</p>}

      {datos && t && (
        <div className="mt-3 grid gap-6 lg:grid-cols-[19rem_1fr]">
          <aside className="panel self-start p-5 lg:sticky lg:top-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-suave">{t.folio}</span>
              <InsigniaEstado estado={t.estado} />
            </div>
            <h1 className="mt-2 text-lg font-semibold tracking-tight">{t.titulo}</h1>
            <div className="mt-1">
              <Prioridad valor={t.prioridad} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {(
                [
                  ["Categoría", t.subcategoria ? `${t.categoria} · ${t.subcategoria}` : t.categoria],
                  ["Ubicación", [t.sede, t.area, t.pisoZona].filter(Boolean).join(" · ")],
                  ["Equipo", t.equipoActivo ?? "—"],
                  ["Impacto", ETIQUETAS_IMPACTO[t.impacto]],
                  ["Reporta", t.reportante],
                ] as [string, string][]
              ).map(([etiqueta, valor]) => (
                <div key={etiqueta}>
                  <dt className="text-xs text-suave">{etiqueta}</dt>
                  <dd>{valor}</dd>
                </div>
              ))}
              {usuario.rol !== "reportante" && (
                <>
                  <div>
                    <dt className="text-xs text-suave">Correo de contacto</dt>
                    <dd>
                      <a href={`mailto:${t.reportanteCorreo}`} className="break-all underline underline-offset-2">
                        {t.reportanteCorreo}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-suave">Teléfono de contacto</dt>
                    <dd>
                      {t.reportanteTelefono ? (
                        <a href={`tel:${t.reportanteTelefono}`} className="underline underline-offset-2">
                          {t.reportanteTelefono}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                </>
              )}
              {(
                [
                  ["Atiende", t.tecnico ?? "Pendiente de asignación"],
                  ["Registrado", fechaHora(t.creadoEn)],
                  ["Fecha objetivo", fechaHora(t.fechaObjetivo)],
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
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.descripcion}</p>
            </section>

            <Evidencias ticketId={t.id} evidencias={datos.evidencias} etapasPermitidas={datos.acciones.etapasEvidencia} alCambiar={recargar} />

            {datos.tecnico && <PanelTecnico key={t.estado} detalle={datos} tecnico={datos.tecnico} recargar={recargar} />}

            <AccionesTicket ticketId={t.id} acciones={datos.acciones} recargar={recargar} />

            {usuario.rol === "reportante" && t.estado === "cerrado" && !datos.acciones.reabrir && (
              <section className="panel p-5 text-sm">
                <p>
                  Ya pasó el plazo para reabrir este reporte. Si el problema continúa, puede registrar un nuevo reporte relacionado con este.
                </p>
                <Link href={`/reportante/nuevo?relacionado=${t.id}`} className="boton mt-3">
                  Registrar nuevo reporte relacionado
                </Link>
              </section>
            )}

            {esPersonal && <Relacionados ticketId={t.id} />}

            <Comentarios ticketId={t.id} comentarios={datos.comentarios} puedeComentar={datos.acciones.comentar} recargar={recargar} />

            {datos.historial && <Historial eventos={datos.historial} />}
          </div>
        </div>
      )}
    </>
  );
}