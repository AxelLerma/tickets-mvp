"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { InsigniaEstado, Prioridad } from "@/components/Insignias";
import { useApi } from "@/lib/api";
import { ETIQUETAS_ESTADO, fechaHora } from "@/lib/formato";
import type { Opcion } from "@/lib/tipos";

interface Fila {
  id: number;
  folio: string;
  titulo: string;
  estado: string;
  prioridad: string;
  creadoEn: string;
  cerradoEn: string | null;
  sede: string;
  categoria: string;
  tecnico: string | null;
}

interface Respuesta {
  tickets: Fila[];
  resumen: { ultimas24h: number; ultimos7d: number; ultimos30d: number };
  sedes: Opcion[];
  tecnicos: Opcion[];
}

const OPCIONES_ESTADO: [string, string][] = [
  ["cerrado", "Cerrados"],
  ["abiertos", "Abiertos"],
  ["cancelado", "Cancelados"],
  ["reabierto", "Reabiertos"],
  ["todos", "Todos"],
];

function Cifra({ valor, texto }: { valor: number; texto: string }) {
  return (
    <div className="panel p-4">
      <p className="text-3xl font-semibold text-ciruela">{valor}</p>
      <p className="text-sm text-suave">{texto}</p>
    </div>
  );
}

export default function Historial() {
  const [estado, setEstado] = useState("cerrado");
  const [sedeId, setSedeId] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState("estado=cerrado");

  const { datos, error, cargando } = useApi<Respuesta>(`/manager/tickets?${consulta}`);

  function buscar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams({ estado });
    if (sedeId) p.set("sedeId", sedeId);
    if (tecnicoId) p.set("tecnicoId", tecnicoId);
    if (texto.trim()) p.set("q", texto.trim());
    setConsulta(p.toString());
  }

  return (
    <>
      <h1 className="titulo-pagina">Historial de tickets</h1>

      {datos && (
        <section className="mb-6 grid grid-cols-3 gap-3">
          <Cifra valor={datos.resumen.ultimas24h} texto="Cerrados en 24 horas" />
          <Cifra valor={datos.resumen.ultimos7d} texto="Cerrados en 7 días" />
          <Cifra valor={datos.resumen.ultimos30d} texto="Cerrados en 30 días" />
        </section>
      )}

      <form onSubmit={buscar} className="panel mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="estado" className="etiqueta">Estado</label>
          <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value)} className="entrada">
            {OPCIONES_ESTADO.map(([valor, nombre]) => (
              <option key={valor} value={valor}>{nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sede" className="etiqueta">Sede</label>
          <select id="sede" value={sedeId} onChange={(e) => setSedeId(e.target.value)} className="entrada">
            <option value="">Todas</option>
            {datos?.sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tecnico" className="etiqueta">Técnico</label>
          <select id="tecnico" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className="entrada">
            <option value="">Todos</option>
            {datos?.tecnicos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="texto" className="etiqueta">Folio o título</label>
          <input id="texto" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={100} placeholder="Ej. TCK-2026 o impresora" className="entrada" />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <button type="submit" className="boton">Buscar</button>
        </div>
      </form>

      {error && <div className="alerta-error">{error}</div>}
      {cargando && <p className="text-sm text-suave">Cargando…</p>}

      {datos && (
        <>
          <p className="mb-2 text-xs text-suave">
            {datos.tickets.length} resultado(s) · se muestran hasta 200, del más reciente al más antiguo.
          </p>
          <div className="panel overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-borde text-suave">
                <tr>
                  <th className="px-4 py-2 font-medium">Folio</th>
                  <th className="px-4 py-2 font-medium">Título</th>
                  <th className="px-4 py-2 font-medium">Sede</th>
                  <th className="px-4 py-2 font-medium">Categoría</th>
                  <th className="px-4 py-2 font-medium">Técnico</th>
                  <th className="px-4 py-2 font-medium">Prioridad</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2 font-medium">Cierre / registro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {datos.tickets.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-suave">
                      No hay tickets con estos filtros.
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
                    <td className="whitespace-nowrap px-4 py-2">{t.categoria}</td>
                    <td className="whitespace-nowrap px-4 py-2">{t.tecnico ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Prioridad valor={t.prioridad} />
                    </td>
                    <td className="px-4 py-2" title={ETIQUETAS_ESTADO[t.estado]}>
                      <InsigniaEstado estado={t.estado} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">{fechaHora(t.cerradoEn ?? t.creadoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}