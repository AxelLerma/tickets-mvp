"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { fechaHora } from "@/lib/formato";
import type { Opcion } from "@/lib/tipos";

const REPORTES: [string, string][] = [
  ["cerrados", "Historial de tickets cerrados"],
  ["carga", "Carga por técnico"],
  ["actividades", "Actividades por categoría o sede"],
  ["reaperturas", "Reaperturas"],
  ["cumplimiento", "Cumplimiento de fechas objetivo"],
];

const ESTADOS: [string, string][] = [
  ["nuevo", "Nuevo"],
  ["asignado", "Asignado"],
  ["en_proceso", "En proceso"],
  ["listo_para_cerrar", "Listo para cerrar"],
  ["cerrado", "Cerrado"],
  ["reabierto", "Reabierto"],
  ["cancelado", "Cancelado"],
];

const PRIORIDADES: [string, string][] = [
  ["baja", "Baja"],
  ["normal", "Normal"],
  ["alta", "Alta"],
];

interface Columna {
  clave: string;
  titulo: string;
  ancho?: number;
}

interface Reporte {
  tipo: string;
  titulo: string;
  descripcion: string;
  columnas: Columna[];
  filas: Record<string, string | number>[];
  total: number;
  resumen: string | null;
  filtros: string;
  generado: string;
}

interface OpcionesRespuesta {
  sedes: Opcion[];
  categorias: Opcion[];
  tecnicos: Opcion[];
}

interface Filtros {
  tipo: string;
  desde: string;
  hasta: string;
  sedeId: string;
  categoriaId: string;
  tecnicoId: string;
  estado: string;
  prioridad: string;
}

const hoyLocal = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());

const restarDias = (fecha: string, dias: number): string => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};

export default function Historial() {
  const [filtros, setFiltros] = useState<Filtros>({
    tipo: "cerrados",
    desde: restarDias(hoyLocal(), 30),
    hasta: hoyLocal(),
    sedeId: "",
    categoriaId: "",
    tecnicoId: "",
    estado: "cerrado",
    prioridad: "",
  });

  const { datos: opciones } = useApi<OpcionesRespuesta>("/reportes/opciones");

  const usaEstado = filtros.tipo !== "carga";

  const p = new URLSearchParams();
  if (filtros.desde) p.set("desde", filtros.desde);
  if (filtros.hasta) p.set("hasta", filtros.hasta);
  if (filtros.sedeId) p.set("sedeId", filtros.sedeId);
  if (filtros.categoriaId) p.set("categoriaId", filtros.categoriaId);
  if (filtros.tecnicoId) p.set("tecnicoId", filtros.tecnicoId);
  if (usaEstado && filtros.estado) p.set("estado", filtros.estado);
  if (filtros.prioridad) p.set("prioridad", filtros.prioridad);
  if (filtros.tipo === "actividades") p.set("agrupar", "categoria");
  const qs = p.toString();

  const { datos, error, cargando } = useApi<Reporte>(`/reportes/${filtros.tipo}?${qs}`);

  const columnasTextoLargo = ["resumen", "ubicacion", "titulo", "motivo", "folios"];

  function exportarCsv() {
    if (!datos) return;
    const headers = datos.columnas
      .map((c) => {
        const s = String(c.titulo).replace(/"/g, '""');
        return /[",\r\n]/.test(s) ? `"${s}"` : s;
      })
      .join(",");
    const rows = datos.filas
      .map((fila) =>
        datos.columnas
          .map((c) => {
            const v = fila[c.clave] ?? "";
            const s = String(v).replace(/"/g, '""');
            return /[",\r\n]/.test(s) ? `"${s}"` : s;
          })
          .join(","),
      )
      .join("\r\n");
    const blob = new Blob([`\uFEFF${headers}\r\n${rows}\r\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-${datos.tipo}-${hoyLocal()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportarPdf() {
    if (!datos) return;
    try {
      const respuesta = await fetch(`/api/reportes/${datos.tipo}/exportar?${qs}&formato=pdf`);
      if (!respuesta.ok) throw new Error("No se pudo generar el PDF.");
      const blob = await respuesta.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-${datos.tipo}-${hoyLocal()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  }

  function imprimirVista() {
    window.print();
  }

  return (
    <>
      <h1 className="titulo-pagina">Historial y Reportes</h1>

      <div className="panel mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5 print:hidden">
        <div>
          <label htmlFor="tipo" className="etiqueta">
            Reporte
          </label>
          <select
            id="tipo"
            value={filtros.tipo}
            onChange={(e) => {
              const valor = e.target.value;
              setFiltros((f) => ({ ...f, tipo: valor }));
              if (valor !== "cerrados" && valor !== "actividades") {
                setFiltros((f) => ({ ...f, estado: "" }));
              }
            }}
            className="entrada"
          >
            {REPORTES.map(([valor, nombre]) => (
              <option key={valor} value={valor}>{nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="desde" className="etiqueta">
            Desde
          </label>
          <input
            id="desde"
            type="date"
            value={filtros.desde}
            onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
            className="entrada"
          />
        </div>
        <div>
          <label htmlFor="hasta" className="etiqueta">
            Hasta
          </label>
          <input
            id="hasta"
            type="date"
            value={filtros.hasta}
            onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
            className="entrada"
          />
        </div>
        <div>
          <label htmlFor="sede" className="etiqueta">
            Sede
          </label>
          <select
            id="sede"
            value={filtros.sedeId}
            onChange={(e) => setFiltros((f) => ({ ...f, sedeId: e.target.value }))}
            className="entrada"
          >
            <option value="">Todas</option>
            {opciones?.sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="categoria" className="etiqueta">
            Categoría
          </label>
          <select
            id="categoria"
            value={filtros.categoriaId}
            onChange={(e) => setFiltros((f) => ({ ...f, categoriaId: e.target.value }))}
            className="entrada"
          >
            <option value="">Todas</option>
            {opciones?.categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tecnico" className="etiqueta">
            Técnico
          </label>
          <select
            id="tecnico"
            value={filtros.tecnicoId}
            onChange={(e) => setFiltros((f) => ({ ...f, tecnicoId: e.target.value }))}
            className="entrada"
          >
            <option value="">Todos</option>
            {opciones?.tecnicos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
        {usaEstado && (
          <div>
            <label htmlFor="estado" className="etiqueta">
              Estado
            </label>
            <select
              id="estado"
              value={filtros.estado}
              onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}
              className="entrada"
            >
              {ESTADOS.map(([valor, nombre]) => (
                <option key={valor} value={valor}>{nombre}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="prioridad" className="etiqueta">
            Prioridad
          </label>
          <select
            id="prioridad"
            value={filtros.prioridad}
            onChange={(e) => setFiltros((f) => ({ ...f, prioridad: e.target.value }))}
            className="entrada"
          >
            <option value="">Todas</option>
            {PRIORIDADES.map(([valor, nombre]) => (
              <option key={valor} value={valor}>{nombre}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-5 flex flex-wrap items-end gap-3">
          <span className="text-xs text-suave ml-2">
            Si deja las fechas vacías se usan los últimos 30 días.
          </span>
        </div>
      </div>

      {error && <div className="alerta-error mb-4 print:hidden">{error}</div>}
      {cargando && <p className="text-sm text-suave print:hidden">Cargando…</p>}

      {datos && (
        <>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3 print:hidden">
            <div>
              <h2 className="text-lg font-semibold text-ciruela">{datos.titulo}</h2>
              <p className="text-sm text-suave">{datos.descripcion}</p>
              <p className="mt-1 text-xs text-suave">
                {datos.filtros} · Generado: {datos.generado}
              </p>
              {datos.resumen && <p className="mt-1 text-sm font-medium">{datos.resumen}</p>}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={exportarCsv} className="boton-secundario">
                Exportar CSV
              </button>
              <button type="button" onClick={exportarPdf} className="boton">
                Exportar PDF
              </button>
              <button type="button" onClick={imprimirVista} className="boton-secundario">
                Imprimir vista
              </button>
            </div>
          </div>

          <div className="panel overflow-x-auto">
            <table className="w-full text-left text-sm" id="tabla-reporte">
              <thead className="bg-institucional text-white border-b-2 border-borde">
                <tr>
                  {datos.columnas.map((c) => (
                    <th key={c.clave} className="px-4 py-2.5 text-white font-semibold whitespace-nowrap">
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
                        className={`px-4 py-2 align-top ${columnasTextoLargo.includes(c.clave) ? "whitespace-normal break-words" : "whitespace-nowrap"}`}
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
            <p className="mt-2 text-xs text-suave print:hidden">
              Se muestran {datos.filas.length} de {datos.total} registros. La exportación incluye todos.
            </p>
          )}
        </>
      )}

      <style>
        {`
          @media print {
            body {
              background: #fff !important;
              color: #000 !important;
            }
            .panel {
              box-shadow: none !important;
              border: 1px solid #b49bd4 !important;
            }
            #tabla-reporte {
              width: 100% !important;
            }
          }
        `}
      </style>
    </>
  );
}