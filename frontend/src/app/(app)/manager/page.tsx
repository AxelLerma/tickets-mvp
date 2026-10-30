"use client";

import Link from "next/link";
import { InsigniaEstado, Prioridad } from "@/components/Insignias";
import { useApi } from "@/lib/api";
import { estaVencido, fechaHora } from "@/lib/formato";
import type { Ticket } from "@/lib/tipos";

interface Dashboard {
  totales: { abiertos: number; sinAsignar: number; vencidos: number };
  carga: { id: number; nombre: string; region: string | null; activos: number }[];
  tickets: Ticket[];
}

function Indicador({ valor, texto, alerta }: { valor: number; texto: string; alerta?: boolean }) {
  return (
    <div className="panel p-4">
      <p className={`text-3xl font-semibold ${alerta && valor > 0 ? "text-error" : ""}`}>{valor}</p>
      <p className="text-sm text-suave">{texto}</p>
    </div>
  );
}

export default function PanelOperativo() {
  const { datos, error, cargando } = useApi<Dashboard>("/manager/dashboard");

  return (
    <>
      <h1 className="titulo-pagina">Panel operativo</h1>

      {error && <div className="alerta-error">{error}</div>}
      {cargando && <p className="text-sm text-suave">Cargando…</p>}

      {datos && (
        <div className="space-y-8">
          <section className="grid grid-cols-3 gap-3">
            <Indicador valor={datos.totales.abiertos} texto="Tickets abiertos" />
            <Indicador valor={datos.totales.sinAsignar} texto="Sin asignar" alerta />
            <Indicador valor={datos.totales.vencidos} texto="Vencidos" alerta />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-suave">Carga por técnico</h2>
            <div className="panel overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-borde text-suave">
                  <tr>
                    <th className="px-4 py-2 font-medium">Técnico</th>
                    <th className="px-4 py-2 font-medium">Región</th>
                    <th className="px-4 py-2 text-right font-medium">Tickets abiertos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {datos.carga.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2">{c.nombre}</td>
                      <td className="px-4 py-2">{c.region ?? "—"}</td>
                      <td className="px-4 py-2 text-right">{c.activos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-suave">Tickets abiertos</h2>
            <div className="panel overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-borde text-suave">
                  <tr>
                    <th className="px-4 py-2 font-medium">Folio</th>
                    <th className="px-4 py-2 font-medium">Título</th>
                    <th className="px-4 py-2 font-medium">Sede</th>
                    <th className="px-4 py-2 font-medium">Prioridad</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium">Técnico</th>
                    <th className="px-4 py-2 font-medium">Vence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {datos.tickets.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-suave">
                        No hay tickets abiertos.
                      </td>
                    </tr>
                  )}
                  {datos.tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-fondo">
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                        <Link href={`/tickets/${t.id}`} className="underline underline-offset-2">
                          {t.folio}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{t.titulo}</td>
                      <td className="whitespace-nowrap px-4 py-2">{t.sede}</td>
                      <td className="px-4 py-2">
                        <Prioridad valor={t.prioridad} />
                      </td>
                      <td className="px-4 py-2">
                        <InsigniaEstado estado={t.estado} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">{t.tecnico ?? "—"}</td>
                      <td className={`whitespace-nowrap px-4 py-2 ${estaVencido(t) ? "font-medium text-error" : ""}`}>
                        {fechaHora(t.fechaObjetivo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}