"use client";

import { useState } from "react";
import { subirArchivo } from "@/lib/api";
import { ETIQUETAS_ETAPA, fechaHora, tamanoLegible } from "@/lib/formato";
import type { Etapa, Evidencia } from "@/lib/tipos";
import { useSesion } from "./SesionProvider";

interface Props {
  ticketId: number;
  evidencias: Evidencia[];
  etapasPermitidas: Etapa[];
  alCambiar: () => void;
}

function tipoCorto(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  return mime.startsWith("video/") ? "Video" : "Imagen";
}

export function Evidencias({ ticketId, evidencias, etapasPermitidas, alCambiar }: Props) {
  const { usuario } = useSesion();
  const [elegida, setElegida] = useState<Etapa | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const etapa = elegida && etapasPermitidas.includes(elegida) ? elegida : etapasPermitidas[0];

  async function subir(archivo: File, etapaSubida: Etapa, reemplazaId?: number) {
    setError(null);
    setProgreso(0);
    try {
      await subirArchivo(
        archivo,
        { ticketId: String(ticketId), etapa: etapaSubida, ...(reemplazaId ? { reemplazaId: String(reemplazaId) } : {}) },
        setProgreso,
      );
      alCambiar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible subir el archivo.");
    } finally {
      setProgreso(null);
    }
  }

  return (
    <section className="panel p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-suave">Evidencias</h2>
      {error && <div className="alerta-error mb-3">{error}</div>}

      {evidencias.length === 0 ? (
        <p className="text-sm text-suave">Aún no hay evidencias adjuntas.</p>
      ) : (
        <ul className="divide-y divide-borde">
          {evidencias.map((ev) => (
            <li key={ev.id} className={`flex gap-3 py-3 ${ev.reemplazadaPor ? "opacity-60" : ""}`}>
              <a href={`/api/evidencias/${ev.id}/archivo`} target="_blank" rel="noreferrer" className="shrink-0">
                {ev.tieneMiniatura ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/evidencias/${ev.id}/miniatura`}
                    alt={ev.nombre}
                    loading="lazy"
                    className="h-14 w-14 rounded-md border border-borde object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-md border border-borde bg-lavanda text-xs text-suave">
                    {tipoCorto(ev.mime)}
                  </span>
                )}
              </a>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">{ev.nombre}</p>
                <p className="text-xs text-suave">
                  {ETIQUETAS_ETAPA[ev.etapa]} · {ev.autor} · {fechaHora(ev.creadoEn)} · {tamanoLegible(ev.tamano)}
                  {ev.reemplazadaPor && " · Reemplazada"}
                </p>
              </div>
              {!ev.reemplazadaPor && ev.autorId === usuario.id && etapasPermitidas.includes(ev.etapa) && (
                <label className="cursor-pointer self-center text-sm text-institucional underline underline-offset-2">
                  Reemplazar
                  <input
                    type="file"
                    accept="image/*,video/*,application/pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const archivo = e.target.files?.[0];
                      if (archivo) subir(archivo, ev.etapa, ev.id);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </li>
          ))}
        </ul>
      )}

      {etapa && (
        <div className="mt-4 space-y-3 border-t border-borde pt-4">
          {etapasPermitidas.length > 1 && (
            <div>
              <label htmlFor="etapa" className="etiqueta">
                Tipo de evidencia
              </label>
              <select id="etapa" value={etapa} onChange={(e) => setElegida(e.target.value as Etapa)} className="entrada">
                {etapasPermitidas.map((e) => (
                  <option key={e} value={e}>
                    {ETIQUETAS_ETAPA[e]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="archivo" className="etiqueta">
              Adjuntar archivo
            </label>
            <input
              id="archivo"
              type="file"
              accept="image/*,video/*,application/pdf"
              disabled={progreso !== null}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) subir(archivo, etapa);
                e.target.value = "";
              }}
              className="entrada"
            />
            <p className="mt-1 text-xs text-suave">Imagen, PDF o video corto. Los archivos se almacenan de forma privada y no se eliminan.</p>
          </div>
          {progreso !== null && (
            <div>
              <div className="h-1.5 w-full bg-borde">
                <div className="h-full bg-institucional transition-[width]" style={{ width: `${progreso}%` }} />
              </div>
              <p className="mt-1 text-xs text-suave">Subiendo… {progreso}%</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}