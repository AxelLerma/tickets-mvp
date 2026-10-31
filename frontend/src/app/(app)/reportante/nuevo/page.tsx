"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, subirArchivo, useApi } from "@/lib/api";
import { ETIQUETAS_IMPACTO } from "@/lib/formato";
import type { Opcion, Ticket } from "@/lib/tipos";

export default function NuevoTicket() {
  const router = useRouter();
  const { datos: catalogos, error: errorCatalogos } = useApi<{ categorias: Opcion[]; sedes: Opcion[] }>("/catalogos");
  
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ id: number; mensaje: string } | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);

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
          sedeId: Number(f.get("sedeId")),
          area: f.get("area"),
          equipoActivo: f.get("equipoActivo") ?? "",
          descripcion: f.get("descripcion"),
          impacto: f.get("impacto"),
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
        mensaje: `Su reporte ${ticket.folio || ''} se registró, pero un archivo no pudo subirse: ${err instanceof Error ? err.message : "error desconocido"}`,
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

      {(error || errorCatalogos) && <div className="alerta-error mb-4">{error ?? errorCatalogos}</div>}
      
      {aviso && (
        <div className="alerta-error mb-4">
          {aviso.mensaje}{" "}
          <Link href={`/tickets/${aviso.id}`} className="underline">Ver reporte y adjuntar de nuevo</Link>
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
            <select id="categoriaId" name="categoriaId" required defaultValue="" className="entrada">
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
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="area" className="etiqueta">
              Área o zona
            </label>
            <input id="area" name="area" maxLength={100} required placeholder="Ej. Contabilidad, piso 2" className="entrada" />
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