"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useAccion, useApi } from "@/lib/api";
import { InsigniaEstado } from "./Insignias";

interface Resumen {
  id: number;
  folio: string;
  titulo: string;
  estado: string;
  sede: string;
  categoria: string;
  tecnico: string | null;
  mismoTecnico: boolean;
}

interface Respuesta {
  relacionados: Resumen[];
  sugeridos: Resumen[];
  puedeVincular: boolean;
  puedeDesvincular: boolean;
}

function Fila({ t, children }: { t: Resumen; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <div className="min-w-0">
        <p>
          <Link href={`/tickets/${t.id}`} className="font-mono text-xs underline underline-offset-2">
            {t.folio}
          </Link>{" "}
          {t.titulo}
        </p>
        <p className="text-xs text-suave">
          {t.categoria} · {t.sede} · {t.tecnico ?? "Sin técnico"}
          {t.mismoTecnico && " · Mismo técnico"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <InsigniaEstado estado={t.estado} />
        {children}
      </div>
    </li>
  );
}

export function Relacionados({ ticketId }: { ticketId: number }) {
  const { datos, error, recargar } = useApi<Respuesta>(`/tickets/${ticketId}/relacionados`);
  const { error: errorAccion, ocupado, ejecutar } = useAccion(recargar);
  const [folio, setFolio] = useState("");

  function vincular(valor: string) {
    ejecutar(async () => {
      await api(`/tickets/${ticketId}/relacionados`, { method: "POST", body: JSON.stringify({ folio: valor }) });
      setFolio("");
    });
  }

  function desvincular(id: number) {
    ejecutar(() => api(`/tickets/${ticketId}/relacionados/${id}`, { method: "DELETE" }));
  }

  return (
    <section className="panel p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-suave">Tickets relacionados</h2>
      <p className="mb-3 text-xs text-suave">Vincule reportes del mismo problema para identificar causas recurrentes. El historial no se borra.</p>

      {(error || errorAccion) && <div className="alerta-error mb-3">{error ?? errorAccion}</div>}

      {datos && (
        <>
          {datos.relacionados.length === 0 ? (
            <p className="text-sm text-suave">Este ticket no tiene relaciones.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {datos.relacionados.map((t) => (
                <Fila key={t.id} t={t}>
                  {datos.puedeDesvincular && (
                    <button
                      disabled={ocupado}
                      onClick={() => desvincular(t.id)}
                      className="cursor-pointer text-xs text-institucional underline underline-offset-2"
                    >
                      Retirar
                    </button>
                  )}
                </Fila>
              ))}
            </ul>
          )}

          {datos.puedeVincular && (
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-borde pt-4">
              <div className="min-w-48 flex-1">
                <label htmlFor="folio-relacion" className="etiqueta">
                  Relacionar por folio
                </label>
                <input
                  id="folio-relacion"
                  value={folio}
                  onChange={(e) => setFolio(e.target.value)}
                  placeholder="TCK-2026-00001"
                  maxLength={30}
                  className="entrada"
                />
              </div>
              <button disabled={ocupado || !folio.trim()} onClick={() => vincular(folio)} className="boton-secundario">
                Relacionar
              </button>
            </div>
          )}

          {datos.sugeridos.length > 0 && (
            <div className="mt-4 border-t border-borde pt-4">
              <p className="text-sm font-medium text-ciruela">Posibles duplicados o repeticiones</p>
              <p className="text-xs text-suave">Misma sede y misma categoría o equipo en los últimos 60 días.</p>
              <ul className="divide-y divide-borde">
                {datos.sugeridos.map((t) => (
                  <Fila key={t.id} t={t}>
                    {datos.puedeVincular && (
                      <button
                        disabled={ocupado}
                        onClick={() => vincular(t.folio)}
                        className="cursor-pointer text-xs text-institucional underline underline-offset-2"
                      >
                        Relacionar
                      </button>
                    )}
                  </Fila>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}