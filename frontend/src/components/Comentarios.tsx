"use client";

import { useState } from "react";
import { api, useAccion } from "@/lib/api";
import { fechaHora } from "@/lib/formato";
import type { Comentario } from "@/lib/tipos";

export function Comentarios({
  ticketId,
  comentarios,
  puedeComentar,
  recargar,
}: {
  ticketId: number;
  comentarios: Comentario[];
  puedeComentar: boolean;
  recargar: () => void;
}) {
  const { error, ocupado, ejecutar } = useAccion(recargar);
  const [texto, setTexto] = useState("");

  return (
    <section className="panel p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-suave">Seguimiento</h2>
      {comentarios.length === 0 && <p className="text-sm text-suave">Sin comentarios por el momento.</p>}
      <ul className="space-y-3">
        {comentarios.map((c) => (
          <li key={c.id} className={`text-sm ${c.tipo === "sistema" ? "text-suave" : ""}`}>
            <p className="text-xs text-suave">
              {c.autor ?? "Sistema"} · {fechaHora(c.creadoEn)}
            </p>
            <p className="whitespace-pre-wrap">{c.texto}</p>
          </li>
        ))}
      </ul>

      {puedeComentar && (
        <div className="mt-4 space-y-2 border-t border-borde pt-4">
          {error && <div className="alerta-error">{error}</div>}
          <label htmlFor="comentario" className="etiqueta">Agregar comentario</label>
          <textarea id="comentario" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} className="entrada" />
          <button
            disabled={ocupado || !texto.trim()}
            onClick={() =>
              ejecutar(async () => {
                await api(`/tickets/${ticketId}/comentarios`, { method: "POST", body: JSON.stringify({ texto }) });
                setTexto("");
              })
            }
            className="boton"
          >
            Enviar
          </button>
        </div>
      )}
    </section>
  );
}