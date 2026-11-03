"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { InsigniaEstado } from "@/components/Insignias";
import { api, useAccion, useApi } from "@/lib/api";
import { duracion, fechaHora } from "@/lib/formato";

type Prioridad = "baja" | "normal" | "alta";
type Capacidad = "disponible" | "balanceado" | "saturado";
type Riesgo = "vencido" | "riesgo" | null;

interface TicketGestion {
  id: number;
  folio: string;
  titulo: string;
  estado: string;
  prioridad: Prioridad;
  fechaObjetivo: string;
  tecnicoId: number | null;
  tecnico: string | null;
  sede: string;
  categoria: string;
  riesgo: Riesgo;
}

interface TecnicoCarga {
  id: number;
  nombre: string;
  region: string | null;
  activos: number;
  enProceso: number;
  vencidos: number;
  porVencer: number;
  minutosSemana: number;
  cierresSemana: number;
  prioridadMaxima: Prioridad | null;
  capacidad: Capacidad;
}

interface Periodos {
  nombre: string;
  hoy: number;
  semana: number;
  mes: number;
}

interface Panel {
  totales: { abiertos: number; sinAsignar: number; enRiesgo: number; vencidos: number; reabiertos: number };
  tickets: TicketGestion[];
  tecnicos: TecnicoCarga[];
  cierres: { porTecnico: Periodos[]; porCategoria: Periodos[] };
  reabiertos: { id: number; folio: string; titulo: string; reabiertoEn: string; categoria: string; tecnico: string | null }[];
  repetidos: {
    categoriaSede: { categoria: string; sede: string; total: number }[];
    equipos: { equipo: string; total: number }[];
  };
}

const ETIQUETA_CAPACIDAD: Record<Capacidad, string> = {
  disponible: "Disponible",
  balanceado: "Balanceado",
  saturado: "Saturado",
};

const ESTILO_CAPACIDAD: Record<Capacidad, string> = {
  disponible: "border-[#98cdd0] bg-aqua-claro text-institucional-oscuro",
  balanceado: "border-[#b7a2d6] bg-lavanda text-ciruela",
  saturado: "border-rosa bg-rosa text-white",
};

const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = { baja: "Baja", normal: "Normal", alta: "Alta" };

function Indicador({ valor, texto, alerta }: { valor: number; texto: string; alerta?: boolean }) {
  return (
    <div className="panel p-4">
      <p className={`text-3xl font-semibold ${alerta && valor > 0 ? "text-error" : "text-ciruela"}`}>{valor}</p>
      <p className="text-sm text-suave">{texto}</p>
    </div>
  );
}

function InsigniaCapacidad({ valor }: { valor: Capacidad }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${ESTILO_CAPACIDAD[valor]}`}>
      {ETIQUETA_CAPACIDAD[valor]}
    </span>
  );
}

function InsigniaRiesgo({ valor }: { valor: Riesgo }) {
  if (!valor) return <span className="text-suave">—</span>;
  return valor === "vencido" ? (
    <span className="text-sm font-semibold text-error">Vencido</span>
  ) : (
    <span className="text-sm font-semibold text-rosa">En riesgo</span>
  );
}

function TablaPeriodos({ titulo, filas }: { titulo: string; filas: Periodos[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b-2 border-borde text-suave">
          <tr>
            <th className="px-4 py-2 font-medium">{titulo}</th>
            <th className="px-4 py-2 text-right font-medium">Hoy</th>
            <th className="px-4 py-2 text-right font-medium">Semana</th>
            <th className="px-4 py-2 text-right font-medium">Mes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {filas.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-4 text-center text-suave">
                Sin cierres en el mes.
              </td>
            </tr>
          )}
          {filas.map((f) => (
            <tr key={f.nombre}>
              <td className="px-4 py-2">{f.nombre}</td>
              <td className="px-4 py-2 text-right">{f.hoy}</td>
              <td className="px-4 py-2 text-right">{f.semana}</td>
              <td className="px-4 py-2 text-right">{f.mes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PanelOperativo() {
  const [dias, setDias] = useState(30);
  const { datos, error, cargando, recargar } = useApi<Panel>(`/manager/dashboard?dias=${dias}`);
  const { error: errorAccion, ocupado, ejecutar } = useAccion(recargar);
  const [soloAtencion, setSoloAtencion] = useState(true);
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [tecnicoId, setTecnicoId] = useState("");
  const [comentario, setComentario] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const recargarRef = useRef(recargar);
  useEffect(() => {
    recargarRef.current = recargar;
  });
  useEffect(() => {
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") recargarRef.current();
    }, 30000);
    return () => clearInterval(intervalo);
  }, []);

  const visibles = datos ? datos.tickets.filter((t) => !soloAtencion || t.estado === "nuevo" || t.riesgo) : [];
  const idsVisibles = new Set(visibles.map((t) => t.id));
  const elegidos = seleccion.filter((id) => idsVisibles.has(id));
  const todosElegidos = visibles.length > 0 && elegidos.length === visibles.length;

  function alternar(id: number) {
    setSeleccion((actual) => (actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]));
  }

  function reasignar() {
    setAviso(null);
    ejecutar(async () => {
      const r = await api<{ reasignados: number }>("/manager/reasignar", {
        method: "POST",
        body: JSON.stringify({ ticketIds: elegidos, tecnicoId: Number(tecnicoId), comentario }),
      });
      setAviso(`${r.reasignados} ticket(s) asignado(s) correctamente.`);
      setSeleccion([]);
      setComentario("");
    });
  }

  function cambiarPrioridad(t: TicketGestion, prioridad: string) {
    setAviso(null);
    ejecutar(async () => {
      await api(`/manager/tickets/${t.id}/prioridad`, { method: "PATCH", body: JSON.stringify({ prioridad }) });
      setAviso(`Prioridad de ${t.folio} actualizada a ${prioridad}.`);
    });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-ciruela">Panel operativo</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="dias" className="text-sm text-suave">
            Periodo para reabiertos y repetidos
          </label>
          <select id="dias" value={dias} onChange={(e) => setDias(Number(e.target.value))} className="entrada w-auto py-2">
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
          </select>
        </div>
      </div>

      {error && <div className="alerta-error mb-4">{error}</div>}
      {errorAccion && <div className="alerta-error mb-4">{errorAccion}</div>}
      {aviso && <div className="mb-4 border border-institucional/40 bg-aqua-claro px-4 py-3 text-sm text-institucional-oscuro">{aviso}</div>}
      {cargando && <p className="text-sm text-suave">Cargando…</p>}

      {datos && (
        <div className="space-y-8">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Indicador valor={datos.totales.abiertos} texto="Abiertos" />
            <Indicador valor={datos.totales.sinAsignar} texto="Sin asignar" alerta />
            <Indicador valor={datos.totales.enRiesgo} texto="En riesgo" alerta />
            <Indicador valor={datos.totales.vencidos} texto="Vencidos" alerta />
            <Indicador valor={datos.totales.reabiertos} texto={`Reabiertos (${dias} días)`} />
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-suave">
                {soloAtencion ? "Requieren acción" : "Todos los tickets abiertos"}
              </h2>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!soloAtencion}
                  onChange={(e) => setSoloAtencion(!e.target.checked)}
                  className="accent-institucional"
                />
                Mostrar todos los abiertos
              </label>
            </div>

            <div className="panel mb-3 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <label htmlFor="tecnico" className="etiqueta">
                  Asignar o reasignar a
                </label>
                <select id="tecnico" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className="entrada">
                  <option value="">Seleccione un técnico…</option>
                  {datos.tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} · {t.region ?? "Sin región"} · {ETIQUETA_CAPACIDAD[t.capacidad]} ({t.activos})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="motivo" className="etiqueta">
                  Comentario <span className="font-normal text-suave">(opcional)</span>
                </label>
                <input id="motivo" value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} className="entrada" />
              </div>
              <button disabled={ocupado || elegidos.length === 0 || !tecnicoId} onClick={reasignar} className="boton">
                Asignar seleccionados ({elegidos.length})
              </button>
            </div>

            <div className="panel overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b-2 border-borde text-suave">
                  <tr>
                    <th className="px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={todosElegidos}
                        onChange={() => setSeleccion(todosElegidos ? [] : visibles.map((t) => t.id))}
                        className="accent-institucional"
                      />
                    </th>
                    <th className="px-4 py-2 font-medium">Folio</th>
                    <th className="px-4 py-2 font-medium">Título</th>
                    <th className="px-4 py-2 font-medium">Sede</th>
                    <th className="px-4 py-2 font-medium">Prioridad</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium">Técnico</th>
                    <th className="px-4 py-2 font-medium">Vence</th>
                    <th className="px-4 py-2 font-medium">Riesgo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {visibles.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-suave">
                        {soloAtencion ? "Ningún ticket requiere acción por ahora." : "No hay tickets abiertos."}
                      </td>
                    </tr>
                  )}
                  {visibles.map((t) => (
                    <tr key={t.id} className={elegidos.includes(t.id) ? "bg-lavanda" : "hover:bg-fondo"}>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${t.folio}`}
                          checked={elegidos.includes(t.id)}
                          onChange={() => alternar(t.id)}
                          className="accent-institucional"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                        <Link href={`/tickets/${t.id}`} className="underline underline-offset-2">
                          {t.folio}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{t.titulo}</td>
                      <td className="whitespace-nowrap px-4 py-2">{t.sede}</td>
                      <td className="px-4 py-2">
                        <select
                          aria-label={`Prioridad de ${t.folio}`}
                          value={t.prioridad}
                          disabled={ocupado}
                          onChange={(e) => cambiarPrioridad(t, e.target.value)}
                          className="entrada w-28 py-1.5 text-sm"
                        >
                          {(Object.keys(ETIQUETA_PRIORIDAD) as Prioridad[]).map((p) => (
                            <option key={p} value={p}>
                              {ETIQUETA_PRIORIDAD[p]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <InsigniaEstado estado={t.estado} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">{t.tecnico ?? "—"}</td>
                      <td className={`whitespace-nowrap px-4 py-2 ${t.riesgo === "vencido" ? "font-medium text-error" : ""}`}>
                        {fechaHora(t.fechaObjetivo)}
                      </td>
                      <td className="px-4 py-2">
                        <InsigniaRiesgo valor={t.riesgo} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-suave">Carga por técnico</h2>
            <div className="panel overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b-2 border-borde text-suave">
                  <tr>
                    <th className="px-4 py-2 font-medium">Técnico</th>
                    <th className="px-4 py-2 font-medium">Región</th>
                    <th className="px-4 py-2 font-medium">Capacidad</th>
                    <th className="px-4 py-2 text-right font-medium">Activos</th>
                    <th className="px-4 py-2 text-right font-medium">En proceso</th>
                    <th className="px-4 py-2 text-right font-medium">Vencidos / por vencer</th>
                    <th className="px-4 py-2 text-right font-medium">Horas (semana)</th>
                    <th className="px-4 py-2 text-right font-medium">Cierres (semana)</th>
                    <th className="px-4 py-2 font-medium">Prioridad más alta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {datos.tecnicos.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap px-4 py-2">{t.nombre}</td>
                      <td className="px-4 py-2">{t.region ?? "—"}</td>
                      <td className="px-4 py-2">
                        <InsigniaCapacidad valor={t.capacidad} />
                      </td>
                      <td className="px-4 py-2 text-right">{t.activos}</td>
                      <td className="px-4 py-2 text-right">{t.enProceso}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={t.vencidos > 0 ? "font-semibold text-error" : ""}>{t.vencidos}</span> / {t.porVencer}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">{duracion(t.minutosSemana)}</td>
                      <td className="px-4 py-2 text-right">{t.cierresSemana}</td>
                      <td className="px-4 py-2">{t.prioridadMaxima ? ETIQUETA_PRIORIDAD[t.prioridadMaxima] : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-suave">
              La capacidad se calcula con el número de tickets abiertos y su prioridad (alta pesa 3, normal 2, baja 1). La decisión de
              reasignar es de la coordinación.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-suave">Cierres del periodo</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <TablaPeriodos titulo="Por técnico" filas={datos.cierres.porTecnico} />
              <TablaPeriodos titulo="Por categoría" filas={datos.cierres.porCategoria} />
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-suave">Reabiertos ({dias} días)</h2>
              <div className="panel">
                {datos.reabiertos.length === 0 && <p className="px-4 py-4 text-sm text-suave">Sin reaperturas en el periodo.</p>}
                <ul className="divide-y divide-borde text-sm">
                  {datos.reabiertos.map((r) => (
                    <li key={r.id} className="px-4 py-3">
                      <Link href={`/tickets/${r.id}`} className="font-mono text-xs underline underline-offset-2">
                        {r.folio}
                      </Link>{" "}
                      {r.titulo}
                      <p className="text-xs text-suave">
                        {r.categoria} · {r.tecnico ?? "Sin técnico"} · {fechaHora(r.reabiertoEn)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-suave">Problemas repetidos ({dias} días)</h2>
              <div className="panel">
                {datos.repetidos.categoriaSede.length === 0 && datos.repetidos.equipos.length === 0 && (
                  <p className="px-4 py-4 text-sm text-suave">No se detectan repeticiones en el periodo.</p>
                )}
                <ul className="divide-y divide-borde text-sm">
                  {datos.repetidos.categoriaSede.map((r) => (
                    <li key={`${r.categoria}-${r.sede}`} className="flex justify-between gap-3 px-4 py-3">
                      <span>
                        {r.categoria} <span className="text-suave">en {r.sede}</span>
                      </span>
                      <span className="font-semibold text-ciruela">{r.total} tickets</span>
                    </li>
                  ))}
                  {datos.repetidos.equipos.map((r) => (
                    <li key={r.equipo} className="flex justify-between gap-3 px-4 py-3">
                      <span>
                        Equipo <span className="font-mono text-xs">{r.equipo}</span>
                      </span>
                      <span className="font-semibold text-ciruela">{r.total} tickets</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}