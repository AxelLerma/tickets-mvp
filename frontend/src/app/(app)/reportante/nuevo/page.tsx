"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { api, subirArchivo, useApi } from "@/lib/api";
import { ETIQUETAS_IMPACTO } from "@/lib/formato";
import type { Catalogos, Ticket } from "@/lib/tipos";

function Formulario() {
  const router = useRouter();
  const parametros = useSearchParams();
  const relacionadoId = Number(parametros.get("relacionado")) || null;
  const { datos: catalogos, error: errorCatalogos } = useApi<Catalogos>("/catalogos");
  const [categoriaId, setCategoriaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ id: number; mensaje: string } | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const subcategorias = catalogos?.subcategorias.filter((s) => String(s.categoriaId) === categoriaId) ?? [];

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const archivos = (f.getAll("archivos") as File[]).filter((a) => a.size > 0);
    setError(null);
    setAviso(null);
    setEnviando(true);

    let ticket: Ticket;
    try {
      const r = await api<{ ticket: Ticket }>("/tickets", {
        method: "POST",
        body: JSON.stringify({
          titulo: f.get("titulo"),
          categoriaId: Number(f.get("categoriaId")),
          subcategoriaId: Number(f.get("subcategoriaId")) || null,
          sedeId: Number(f.get("sedeId")),
          area: f.get("area"),
          pisoZona: f.get("pisoZona") ?? "",
          equipoActivo: f.get("equipoActivo") ?? "",
          descripcion: f.get("descripcion"),
          impacto: f.get("impacto"),
          relacionadoId,
        }),
      });
      ticket = r.ticket;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible registrar el reporte.");
      setEnviando(false);
      return;
    }

    try {
      for (const [i, archivo] of archivos.entries()) {
        setProgreso(`Subiendo archivo ${i + 1} de ${archivos.length}…`);
        await subirArchivo(archivo, { ticketId: String(ticket.id), etapa: "inicial_reportante" });
      }
    } catch (err) {
      setProgreso(null);
      setEnviando(false);
      setAviso({
        id: ticket.id,
        mensaje: `Su reporte ${ticket.folio} se registró, pero un archivo no pudo subirse: ${err instanceof Error ? err.message : "error desconocido"}`,
      });
      return;
    }
    router.push(`/tickets/${ticket.id}`);
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/reportante" className="text-sm text-suave hover:text-tinta">
        ← Mis solicitudes
      </Link>
      <h1 className="titulo-pagina mt-3">Reportar problema</h1>

      {relacionadoId && (
        <div className="mb-4 border border-borde bg-lavanda px-4 py-3 text-sm">
          Este reporte quedará relacionado con un reporte anterior, para dar seguimiento al mismo problema.
        </div>
      )}
      {(error || errorCatalogos) && <div className="alerta-error mb-4">{error ?? errorCatalogos}</div>}
      {aviso && (
        <div className="alerta-error mb-4">
          {aviso.mensaje}{" "}
          <Link href={`/tickets/${aviso.id}`} className="underline">
            Ver reporte y adjuntar de nuevo
          </Link>
        </div>
      )}

      <form onSubmit={enviar} className="panel space-y-5 p-6">
        <div>
          <label htmlFor="titulo" className="etiqueta">
            Título del reporte
          </label>
          <input id="titulo" name="titulo" maxLength={120} required placeholder="Ej. La impresora no imprime" className="entrada" />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="categoriaId" className="etiqueta">
              Categoría
            </label>
            <select
              id="categoriaId"
              name="categoriaId"
              required
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="entrada"
            >
              <option value="" disabled>
                Seleccione…
              </option>
              {catalogos?.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="subcategoriaId" className="etiqueta">
              Subcategoría <span className="font-normal text-suave">(opcional)</span>
            </label>
            <select
              key={categoriaId}
              id="subcategoriaId"
              name="subcategoriaId"
              defaultValue=""
              disabled={subcategorias.length === 0}
              className="entrada"
            >
              <option value="">{subcategorias.length === 0 ? "Sin opciones" : "Seleccione…"}</option>
              {subcategorias.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="sedeId" className="etiqueta">
              Sede
            </label>
            <select id="sedeId" name="sedeId" required defaultValue="" className="entrada">
              <option value="" disabled>
                Seleccione…
              </option>
              {catalogos?.sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="area" className="etiqueta">
              Área
            </label>
            <input id="area" name="area" maxLength={100} required placeholder="Ej. Contabilidad" className="entrada" />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="pisoZona" className="etiqueta">
              Piso o zona <span className="font-normal text-suave">(opcional)</span>
            </label>
            <input id="pisoZona" name="pisoZona" maxLength={100} placeholder="Ej. Piso 2, ala norte" className="entrada" />
          </div>
          <div>
            <label htmlFor="equipoActivo" className="etiqueta">
              Equipo <span className="font-normal text-suave">(opcional)</span>
            </label>
            <input id="equipoActivo" name="equipoActivo" maxLength={120} placeholder="Código o número de serie" className="entrada" />
          </div>
        </div>

        <div>
          <label htmlFor="descripcion" className="etiqueta">
            ¿Qué ocurre y desde cuándo?
          </label>
          <textarea id="descripcion" name="descripcion" rows={5} maxLength={4000} required className="entrada" />
        </div>

        <fieldset>
          <legend className="etiqueta">¿A quién afecta el problema?</legend>
          <div className="space-y-2">
            {Object.entries(ETIQUETAS_IMPACTO).map(([valor, texto]) => (
              <label
                key={valor}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-sm border border-borde px-3 text-sm has-checked:border-institucional has-checked:bg-fondo"
              >
                <input type="radio" name="impacto" value={valor} required className="accent-institucional" />
                {texto}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="archivos" className="etiqueta">
            Evidencia <span className="font-normal text-suave">(opcional: foto, captura o video corto)</span>
          </label>
          <input id="archivos" name="archivos" type="file" multiple accept="image/*,video/*,application/pdf" className="entrada" />
        </div>

        <button type="submit" disabled={enviando} className="boton w-full">
          {enviando ? (progreso ?? "Enviando…") : "Enviar reporte"}
        </button>
      </form>
    </div>
  );
}

export default function NuevoTicket() {
  return (
    <Suspense fallback={<p className="text-sm text-suave">Cargando…</p>}>
      <Formulario />
    </Suspense>
  );
}