"use client";

import { useState } from "react";
import { useApi } from "@/lib/api";

const REPORTES: [string, string][] = [
  ["cerrados", "Historial de tickets cerrados"],
  ["carga", "Carga por técnico"],
  ["actividades", "Actividades por categoría o sede"],
  ["reaperturas", "Reaperturas"],
  ["cumplimiento", "Cumplimiento de fechas objetivo"],
];

interface Opcion {
  id: number;
  nombre: string;
}

interface Reporte {
  titulo: string;
  descripcion: string;
  columnas: { clave: string; titulo: string }[];
  filas: Record<string, string | number>[];
  total: number;
  resumen: string | null;
  filtros: string;
  generado: string;
}

const ESTADOS: [string, string][] = [
  ["nuevo", "Nuevo"],
  ["asignado", "Asignado"],
  ["en_proceso", "En proceso"],
  ["cerrado", "Cerrado"],
  ["reabierto", "Reabierto"],
  ["cancelado", "Cancelado"],
];

export default function Reportes() {
  const [tipo, setTipo] = useState("cerrados");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [sedeId, setSedeId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [estado, setEstado] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [agrupar, setAgrupar] = useState("categoria");
  const { datos: opciones } = useApi<{ sedes: Opcion[]; categorias: Opcion[]; tecnicos: Opcion[] }>("/reportes/opciones");

  const usaEstado = tipo !== "carga";

  function construir(): string {
    const p = new URLSearchParams();
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    if (sedeId) p.set("sedeId", sedeId);
    if (categoriaId) p.set("categoriaId", categoriaId);
    if (tecnicoId) p.set("tecnicoId", tecnicoId);
    if (usaEstado && estado) p.set("estado", estado);
    if (prioridad) p.set("prioridad", prioridad);
    if (tipo === "actividades") p.set("agrupar", agrupar);
    return p.toString();
  }

  const qs = construir();

  const { datos, error, cargando } = useApi<Reporte>(`/reportes/${tipo}?${qs}`);

  const base = `/api/reportes/${tipo}/exportar?${qs}${qs ? "&" : ""}formato=`;

  return (
    <>
      <h1 className="titulo-pagina">Reportes de antecedente</h1>

      <div className="panel mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4">
          <label htmlFor="tipo" className="etiqueta">
            Reporte
          </label>
          <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="entrada">
            {REPORTES.map(([valor, nombre]) => (
              <option key={valor} value={valor}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="desde" className="etiqueta">
            Desde
          </label>
          <input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="entrada" />
        </div>
        <div>
          <label htmlFor="hasta" className="etiqueta">
            Hasta
          </label>
          <input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="entrada" />
        </div>
        <div>
          <label htmlFor="sede" className="etiqueta">
            Sede
          </label>
          <select id="sede" value={sedeId} onChange={(e) => setSedeId(e.target.value)} className="entrada">
            <option value="">Todas</option>
            {opciones?.sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="categoria" className="etiqueta">
            Categoría
          </label>
          <select id="categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="entrada">
            <option value="">Todas</option>
            {opciones?.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tecnico" className="etiqueta">
            Técnico
          </label>
          <select id="tecnico" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className="entrada">
            <option value="">Todos</option>
            {opciones?.tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="prioridad" className="etiqueta">
            Prioridad
          </label>
          <select id="prioridad" value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="entrada">
            <option value="">Todas</option>
            <option value="alta">Alta</option>
            <option value="normal">Normal</option>
            <option value="baja">Baja</option>
          </select>
        </div>
        {usaEstado && (
          <div>
            <label htmlFor="estado" className="etiqueta">
              Estado
            </label>
            <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value)} className="entrada">
              <option value="">Todos</option>
              {ESTADOS.map(([valor, nombre]) => (
                <option key={valor} value={valor}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        {tipo === "actividades" && (
          <div>
            <label htmlFor="agrupar" className="etiqueta">
              Agrupar por
            </label>
            <select id="agrupar" value={agrupar} onChange={(e) => setAgrupar(e.target.value)} className="entrada">
              <option value="categoria">Categoría</option>
              <option value="sede">Sede</option>
            </select>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-4">
          <span className="text-xs text-suave">Si deja las fechas vacías se usan los últimos 30 días.</span>
        </div>
      </div>

      {error && <div className="alerta-error mb-4">{error}</div>}
      {cargando && <p className="text-sm text-suave">Cargando…</p>}

      {datos && (
        <section>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ciruela">{datos.titulo}</h2>
              <p className="text-sm text-suave">{datos.descripcion}</p>
              <p className="mt-1 text-xs text-suave">
                {datos.filtros} · Generado: {datos.generado}
              </p>
              {datos.resumen && <p className="mt-1 text-sm font-medium">{datos.resumen}</p>}
            </div>
            <div className="flex gap-3">
              <a href={`${base}csv`} className="boton-secundario">
                Exportar CSV
              </a>
              <a href={`${base}pdf`} className="boton">
                Exportar PDF
              </a>
            </div>
          </div>

          <div className="panel overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-institucional text-white border-b-2 border-borde">
                <tr>
                  {datos.columnas.map((c) => (
                    <th key={c.clave} className="whitespace-nowrap px-4 py-2.5 text-white font-semibold">
                      {c.titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde text-tinta">
                {datos.filas.length === 0 && (
                  <tr>
                    <td colSpan={datos.columnas.length} className="px-4 py-6 text-center text-suave">
                      No hay registros con los filtros seleccionados.
                    </td>
                  </tr>
                )}
                {datos.filas.map((fila, i) => (
                  <tr key={i} className="hover:bg-fondo">
                    {datos.columnas.map((c) => (
                      <td
                        key={c.clave}
                        className={`px-4 py-2 align-top ${["resumen", "ubicacion", "titulo", "motivo", "folios"].includes(c.clave) ? "whitespace-normal break-words" : "whitespace-nowrap"}`}
                      >
                        {fila[c.clave]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {datos.total > datos.filas.length && (
            <p className="mt-2 text-xs text-suave">
              Se muestran {datos.filas.length} de {datos.total} registros. La exportación incluye todos.
            </p>
          )}
        </section>
      )}
    </>
  );
}