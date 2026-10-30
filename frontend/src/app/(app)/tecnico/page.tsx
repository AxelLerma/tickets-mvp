"use client";

import Link from "next/link";
import { InsigniaEstado, Prioridad } from "@/components/Insignias";
import { useApi } from "@/lib/api";
import { estaVencido, fechaHora } from "@/lib/formato";
import type { Ticket } from "@/lib/tipos";

export default function ColaTecnico() {
  const { datos, error, cargando } = useApi<{ tickets: Ticket[] }>("/tecnico/cola");

  return (
    <>
      <h1 className="titulo-pagina">Mi cola de trabajo</h1>
      <p className="-mt-4 mb-6 text-sm text-suave">Ordenada por prioridad y fecha objetivo.</p>

      {error && <div className="alerta-error">{error}</div>}
      {cargando && <p className="text-sm text-suave">Cargando…</p>}
      {datos && datos.tickets.length === 0 && (
        <p className="panel p-6 text-center text-sm text-suave">No hay tickets asignados por el momento.</p>
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
                  {t.sede} · {t.area} · Reporta: {t.reportante}
                </p>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <Prioridad valor={t.prioridad} />
                  <span className={estaVencido(t) ? "font-medium text-error" : "text-suave"}>
                    {estaVencido(t) ? "Vencido: " : "Vence: "}
                    {fechaHora(t.fechaObjetivo)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}