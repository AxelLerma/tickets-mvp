"use client";

import { useState, type FormEvent } from "react";
import { api, useApi } from "@/lib/api";

interface Elemento {
  id: number;
  nombre: string;
  activo: boolean;
  regionId?: number;
  region?: string;
}
interface Datos {
  regiones: Elemento[];
  sedes: Elemento[];
  categorias: Elemento[];
}
type Tipo = "regiones" | "sedes" | "categorias";
type Accion = (peticion: () => Promise<unknown>) => Promise<void>;

function Seccion({
  tipo,
  titulo,
  elementos,
  regiones,
  accion,
}: {
  tipo: Tipo;
  titulo: string;
  elementos: Elemento[];
  regiones: Elemento[];
  accion: Accion;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const [texto, setTexto] = useState("");

  function agregar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const f = new FormData(formulario);
    accion(async () => {
      await api(`/admin/catalogos/${tipo}`, {
        method: "POST",
        body: JSON.stringify({
          nombre: f.get("nombre"),
          regionId: tipo === "sedes" ? Number(f.get("regionId")) : undefined,
        }),
      });
      formulario.reset();
    });
  }

  function guardarNombre(id: number) {
    accion(async () => {
      await api(`/admin/catalogos/${tipo}/${id}`, { method: "PATCH", body: JSON.stringify({ nombre: texto }) });
      setEditando(null);
    });
  }

  function cambiarEstado(el: Elemento) {
    accion(() => api(`/admin/catalogos/${tipo}/${el.id}`, { method: "PATCH", body: JSON.stringify({ activo: !el.activo }) }));
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-suave">{titulo}</h2>
      <div className="panel">
        <form onSubmit={agregar} className="flex flex-wrap gap-3 border-b border-borde p-4">
          <input name="nombre" required maxLength={120} placeholder="Nombre" className="entrada min-w-48 flex-1" />
          {tipo === "sedes" && (
            <select name="regionId" required defaultValue="" className="entrada w-auto">
              <option value="" disabled>Región…</option>
              {regiones.filter((r) => r.activo).map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
          )}
          <button type="submit" className="boton">Agregar</button>
        </form>

        <ul className="divide-y divide-borde">
          {elementos.map((el) => (
            <li key={el.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              {editando === el.id ? (
                <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={120} className="entrada min-w-48 flex-1" />
              ) : (
                <span className={el.activo ? "" : "text-suave line-through"}>
                  {el.nombre}
                  {el.region && <span className="text-suave"> · {el.region}</span>}
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
          <Seccion tipo="regiones" titulo="Regiones" elementos={datos.regiones} regiones={datos.regiones} accion={accion} />
          <Seccion tipo="sedes" titulo="Sedes" elementos={datos.sedes} regiones={datos.regiones} accion={accion} />
          <Seccion tipo="categorias" titulo="Categorías" elementos={datos.categorias} regiones={datos.regiones} accion={accion} />
        </div>
      )}
    </>
  );
}