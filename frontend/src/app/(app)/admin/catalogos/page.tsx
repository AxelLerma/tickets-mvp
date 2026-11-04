"use client";

import { useState, type FormEvent } from "react";
import { api, useApi } from "@/lib/api";

interface Elemento {
  id: number;
  nombre: string;
  activo: boolean;
  padreId?: number;
  padre?: string;
}

type Datos = Record<string, Elemento[]>;
type Accion = (peticion: () => Promise<unknown>) => Promise<void>;

interface Seccion {
  clave: string;
  titulo: string;
  padre?: { clave: string; etiqueta: string };
}

const SECCIONES: Seccion[] = [
  { clave: "regiones", titulo: "Regiones" },
  { clave: "sedes", titulo: "Sedes", padre: { clave: "regiones", etiqueta: "Región" } },
  { clave: "categorias", titulo: "Categorías" },
  { clave: "subcategorias", titulo: "Subcategorías", padre: { clave: "categorias", etiqueta: "Categoría" } },
  { clave: "grupos", titulo: "Grupos técnicos" },
  { clave: "motivos-espera", titulo: "Motivos de espera" },
  { clave: "motivos-cancelacion", titulo: "Motivos de cancelación" },
  { clave: "motivos-cierre", titulo: "Tipos de solución (motivos de cierre)" },
];

function Bloque({
  seccion,
  elementos,
  padres,
  accion,
}: {
  seccion: Seccion;
  elementos: Elemento[];
  padres: Elemento[];
  accion: Accion;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const [texto, setTexto] = useState("");

  function agregar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const f = new FormData(formulario);
    accion(async () => {
      await api(`/admin/catalogos/${seccion.clave}`, {
        method: "POST",
        body: JSON.stringify({
          nombre: f.get("nombre"),
          padreId: seccion.padre ? Number(f.get("padreId")) : undefined,
        }),
      });
      formulario.reset();
    });
  }

  function guardarNombre(id: number) {
    accion(async () => {
      await api(`/admin/catalogos/${seccion.clave}/${id}`, { method: "PATCH", body: JSON.stringify({ nombre: texto }) });
      setEditando(null);
    });
  }

  function cambiarEstado(el: Elemento) {
    accion(() => api(`/admin/catalogos/${seccion.clave}/${el.id}`, { method: "PATCH", body: JSON.stringify({ activo: !el.activo }) }));
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-suave">{seccion.titulo}</h2>
      <div className="panel">
        <form onSubmit={agregar} className="flex flex-wrap gap-3 border-b-2 border-borde p-4">
          <input name="nombre" required maxLength={120} placeholder="Nombre" className="entrada min-w-48 flex-1" />
          {seccion.padre && (
            <select name="padreId" required defaultValue="" aria-label={seccion.padre.etiqueta} className="entrada w-auto">
              <option value="" disabled>
                {seccion.padre.etiqueta}…
              </option>
              {padres
                .filter((p) => p.activo)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </select>
          )}
          <button type="submit" className="boton">Agregar</button>
        </form>

        {elementos.length === 0 && <p className="px-4 py-4 text-sm text-suave">Aún no hay elementos.</p>}
        <ul className="divide-y divide-borde">
          {elementos.map((el) => (
            <li key={el.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              {editando === el.id ? (
                <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={120} className="entrada min-w-48 flex-1" />
              ) : (
                <span className={el.activo ? "" : "text-suave line-through"}>
                  {el.nombre}
                  {el.padre && <span className="text-suave"> · {el.padre}</span>}
                </span>
              )}
              <span className="flex items-center gap-4">
                {editando === el.id ? (
                  <>
                    <button onClick={() => guardarNombre(el.id)} className="cursor-pointer text-institucional underline underline-offset-2">Guardar</button>
                    <button onClick={() => setEditando(null)} className="cursor-pointer text-suave underline underline-offset-2">Cancelar</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setEditando(el.id); setTexto(el.nombre); }} className="cursor-pointer text-institucional underline underline-offset-2">Renombrar</button>
                    <button onClick={() => cambiarEstado(el)} className="cursor-pointer text-institucional underline underline-offset-2">
                      {el.activo ? "Desactivar" : "Activar"}
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Catalogos() {
  const { datos, error, cargando, recargar } = useApi<Datos>("/admin/catalogos");
  const [fallo, setFallo] = useState<string | null>(null);

  const accion: Accion = async (peticion) => {
    setFallo(null);
    try {
      await peticion();
      recargar();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "No fue posible completar la acción.");
    }
  };

  return (
    <>
      <h1 className="titulo-pagina">Catálogos</h1>
      <p className="-mt-4 mb-6 text-sm text-suave">
        Los elementos no se eliminan: al desactivarlos dejan de ofrecerse en los formularios, pero se conserva el historial de los tickets.
      </p>

      {(error || fallo) && <div className="alerta-error mb-4">{error ?? fallo}</div>}
      {cargando && <p className="text-sm text-suave">Cargando…</p>}

      {datos && (
        <div className="space-y-8">
          {SECCIONES.map((s) => (
            <Bloque
              key={s.clave}
              seccion={s}
              elementos={datos[s.clave] ?? []}
              padres={s.padre ? (datos[s.padre.clave] ?? []) : []}
              accion={accion}
            />
          ))}
        </div>
      )}
    </>
  );
}