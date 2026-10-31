"use client";

import { useState } from "react";
import { api, useAccion } from "@/lib/api";
import { duracion, fechaHora } from "@/lib/formato";
import type { DatosTecnico, Detalle } from "@/lib/tipos";
import { Cronometro } from "./Cronometro";

const MIN_ENCONTRO = 100;
const TIEMPOS_RAPIDOS = [15, 30, 45, 60, 90, 120];

function Dato({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{texto}</p>
    </div>
  );
}

export function PanelTecnico({ detalle, tecnico, recargar }: { detalle: Detalle; tecnico: DatosTecnico; recargar: () => void }) {
  const { ticket, acciones, evidencias } = detalle;
  const { intervencion, pasos, esperas, cierre } = tecnico;
  const { error, ocupado, ejecutar } = useAccion(recargar);

  const [encontro, setEncontro] = useState(intervencion.comoSeEncontro ?? "");
  const [queSeHizo, setQueSeHizo] = useState(intervencion.queSeHizo ?? "");
  const [comoSeDejo, setComoSeDejo] = useState(intervencion.comoSeDejo ?? "");
  const [materiales, setMateriales] = useState(intervencion.materiales ?? "");
  const [paso, setPaso] = useState({ descripcion: "", resultado: "", minutos: "" });
  const [motivo, setMotivo] = useState("");

  const base = `/tickets/${ticket.id}`;
  const esperaAbierta = esperas.find((e) => !e.fin);
  const hayEvidenciaInicial = evidencias.some((e) => e.etapa !== "cierre" && !e.reemplazadaPor);
  const totalMinutos = pasos.reduce((suma, p) => suma + p.minutos, 0);
  const encontroValido = encontro.trim().length >= MIN_ENCONTRO;

  const controles: [string, boolean][] = [
    ["Trabajo realizado", queSeHizo.trim().length > 0],
    ["Cómo se dejó", comoSeDejo.trim().length > 0],
    ["Troubleshooting registrado", cierre?.troubleshooting ?? false],
    ["Tiempo registrado", cierre?.tiempo ?? false],
    ["Evidencia de cierre", cierre?.evidencia ?? false],
  ];
  const completo = controles.every(([, ok]) => ok);

  return (
    <section className="panel space-y-8 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-suave">Atención técnica</h2>
      {error && <div className="alerta-error">{error}</div>}

      {/* 1. Inicio */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold">1. Cómo se encontró</h3>
        {ticket.estado === "asignado" && acciones.iniciar ? (
          <>
            <textarea
              value={encontro}
              onChange={(e) => setEncontro(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Describa la condición inicial del equipo o servicio al llegar."
              className="entrada"
            />
            <p className={`text-xs ${encontroValido ? "text-emerald-700" : "text-suave"}`}>
              {encontro.trim().length} de {MIN_ENCONTRO} caracteres mínimos
              {!hayEvidenciaInicial && " · Falta adjuntar una evidencia inicial (sección Evidencias)."}
            </p>
            <button
              disabled={ocupado || !encontroValido || !hayEvidenciaInicial}
              onClick={() => ejecutar(() => api(`${base}/iniciar`, { method: "POST", body: JSON.stringify({ comoSeEncontro: encontro }) }))}
              className="boton"
            >
              Iniciar atención
            </button>
          </>
        ) : ticket.estado === "reabierto" && acciones.iniciar ? (
          <>
            <Dato titulo="Condición registrada originalmente" texto={intervencion.comoSeEncontro} />
            <button disabled={ocupado} onClick={() => ejecutar(() => api(`${base}/iniciar`, { method: "POST", body: "{}" }))} className="boton">
              Retomar atención
            </button>
          </>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{intervencion.comoSeEncontro ?? "Aún no se ha iniciado la atención."}</p>
        )}
      </div>

      {/* 2. Troubleshooting */}
      {(pasos.length > 0 || acciones.registrarTrabajo) && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold">
            2. Troubleshooting
            {totalMinutos > 0 && <span className="ml-2 text-sm font-normal text-suave">Total: {duracion(totalMinutos)}</span>}
          </h3>

          {pasos.length > 0 && (
            <ol className="divide-y divide-borde border border-borde">
              {pasos.map((p) => (
                <li key={p.id} className="px-3 py-3 text-sm">
                  <p className="text-xs text-suave">
                    {fechaHora(p.creadoEn)} · {p.autor} · {duracion(p.minutos)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{p.descripcion}</p>
                  <p className="mt-1 whitespace-pre-wrap text-suave">Resultado: {p.resultado}</p>
                </li>
              ))}
            </ol>
          )}

          {acciones.registrarTrabajo && (
            <div className="space-y-3 border border-borde p-4">
              <p className="text-sm font-medium">Registrar paso</p>
              <textarea
                value={paso.descripcion}
                onChange={(e) => setPaso({ ...paso, descripcion: e.target.value })}
                rows={2}
                placeholder="Qué se hizo"
                className="entrada"
              />
              <textarea
                value={paso.resultado}
                onChange={(e) => setPaso({ ...paso, resultado: e.target.value })}
                rows={2}
                placeholder="Resultado obtenido"
                className="entrada"
              />
              <Cronometro alDetener={(m) => setPaso((p) => ({ ...p, minutos: String(m) }))} />
              <div className="flex flex-wrap items-center gap-2">
                {TIEMPOS_RAPIDOS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaso({ ...paso, minutos: String(m) })}
                    className={`cursor-pointer rounded-sm border px-3 py-2 text-sm ${
                      paso.minutos === String(m) ? "border-institucional bg-fondo font-medium" : "border-borde"
                    }`}
                  >
                    {duracion(m)}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={paso.minutos}
                  onChange={(e) => setPaso({ ...paso, minutos: e.target.value })}
                  placeholder="Minutos"
                  aria-label="Minutos dedicados"
                  className="entrada w-28"
                />
              </div>
              <button
                disabled={ocupado}
                onClick={() =>
                  ejecutar(async () => {
                    await api(`${base}/pasos`, {
                      method: "POST",
                      body: JSON.stringify({ descripcion: paso.descripcion, resultado: paso.resultado, minutos: Number(paso.minutos) }),
                    });
                    setPaso({ descripcion: "", resultado: "", minutos: "" });
                  })
                }
                className="boton"
              >
                Guardar paso
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. Espera de información */}
      {(esperas.length > 0 || acciones.registrarTrabajo) && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">3. Espera de información</h3>
          {esperas.length > 0 && (
            <ul className="space-y-1 text-sm">
              {esperas.map((e) => (
                <li key={e.id}>
                  {e.motivo} <span className="text-suave">· {fechaHora(e.inicio)} → {e.fin ? fechaHora(e.fin) : "en espera"}</span>
                </li>
              ))}
            </ul>
          )}
          {acciones.registrarTrabajo &&
            (esperaAbierta ? (
              <button disabled={ocupado} onClick={() => ejecutar(() => api(`${base}/espera/terminar`, { method: "POST" }))} className="boton-secundario">
                Ya recibí la información: reanudar atención
              </button>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  placeholder="¿Qué información necesita del reportante?"
                  className="entrada"
                />
                <button
                  disabled={ocupado}
                  onClick={() =>
                    ejecutar(async () => {
                      await api(`${base}/espera`, { method: "POST", body: JSON.stringify({ motivo }) });
                      setMotivo("");
                    })
                  }
                  className="boton-secundario"
                >
                  Solicitar información
                </button>
              </div>
            ))}
        </div>
      )}

      {/* 4. Cierre */}
      {acciones.registrarTrabajo ? (
        <div className="space-y-4">
          <h3 className="text-base font-semibold">4. Cierre</h3>
          <div>
            <label htmlFor="que" className="etiqueta">Qué se hizo</label>
            <textarea id="que" value={queSeHizo} onChange={(e) => setQueSeHizo(e.target.value)} rows={3} maxLength={4000} className="entrada" />
          </div>
          <div>
            <label htmlFor="dejo" className="etiqueta">Cómo se dejó (condición final y prueba realizada)</label>
            <textarea id="dejo" value={comoSeDejo} onChange={(e) => setComoSeDejo(e.target.value)} rows={3} maxLength={4000} className="entrada" />
          </div>
          <div>
            <label htmlFor="mat" className="etiqueta">
              Materiales o refacciones <span className="font-normal text-suave">(opcional)</span>
            </label>
            <input id="mat" value={materiales} onChange={(e) => setMateriales(e.target.value)} maxLength={1000} className="entrada" />
          </div>

          <ul className="space-y-1 border border-borde p-3 text-sm">
            {controles.map(([nombre, ok]) => (
              <li key={nombre} className={ok ? "text-emerald-700" : "text-suave"}>
                {ok ? "✓" : "○"} {nombre}
              </li>
            ))}
            {!completo && <li className="pt-1 text-xs text-suave">Agregue la información mínima mandatoria y la evidencia de cierre para concluir este ticket.</li>}
          </ul>

          <div className="flex flex-wrap gap-3">
            <button
              disabled={ocupado}
              onClick={() =>
                ejecutar(() => api(`${base}/cierre`, { method: "PUT", body: JSON.stringify({ queSeHizo, comoSeDejo, materiales }) }))
              }
              className="boton-secundario"
            >
              Guardar borrador
            </button>
            <button
              disabled={ocupado || !completo}
              onClick={() =>
                ejecutar(async () => {
                  await api(`${base}/cierre`, { method: "PUT", body: JSON.stringify({ queSeHizo, comoSeDejo, materiales }) });
                  await api(`${base}/cerrar`, { method: "POST" });
                })
              }
              className="boton"
            >
              Cerrar ticket
            </button>
          </div>
        </div>
      ) : (
        (intervencion.queSeHizo || intervencion.comoSeDejo) && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold">4. Cierre</h3>
            <Dato titulo="Qué se hizo" texto={intervencion.queSeHizo} />
            <Dato titulo="Cómo se dejó" texto={intervencion.comoSeDejo} />
            <Dato titulo="Materiales o refacciones" texto={intervencion.materiales} />
          </div>
        )
      )}
    </section>
  );
}