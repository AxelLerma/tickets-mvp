"use client";

import { useState } from "react";
import { api, useAccion } from "@/lib/api";
import { fechaHora } from "@/lib/formato";
import type { Comentario } from "@/lib/tipos";
import { useSesion } from "./SesionProvider";

const COLOR_ROL: Record<string, string> = {
  reportante: "border-[#e5aac8] bg-rosa-claro",
  tecnico: "border-[#93c8cb] bg-aqua-claro",
  manager: "border-[#b7a2d6] bg-lavanda",
  admin: "border-[#b7a2d6] bg-lavanda",
};

const NOMBRE_ROL: Record<string, string> = {
  reportante: "Reportante",
  tecnico: "Técnico",
  manager: "Coordinación",
  admin: "Administración",
};

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
  const { usuario } = useSesion();
  const { error, ocupado, ejecutar } = useAccion(recargar);
  const [texto, setTexto] = useState("");

  return (
    <section className="panel p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-suave">Seguimiento</h2>
      {comentarios.length === 0 && <p className="text-sm text-suave">Sin comentarios por el momento.</p>}

      <ul className="space-y-3">
        {comentarios.map((c) => {
          if (c.tipo === "sistema") {
            return (
              <li key={c.id} className="mx-auto max-w-[90%] rounded-lg bg-fondo px-3 py-1.5 text-center text-xs text-suave">
                {c.texto} · {fechaHora(c.creadoEn)}
              </li>
            );
          }
          const mio = c.autorId === usuario.id;
          return (
            <li key={c.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl border px-4 py-2 text-sm ${
                  COLOR_ROL[c.rolAutor ?? "manager"]
                } ${mio ? "rounded-br-sm" : "rounded-bl-sm"}`}
              >
                <p className="text-xs font-medium text-suave">
                  {mio ? "Usted" : c.autor} · {NOMBRE_ROL[c.rolAutor ?? ""] ?? ""} · {fechaHora(c.creadoEn)}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{c.texto}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {puedeComentar && (
        <div className="mt-4 space-y-2 border-t border-borde pt-4">
          {error && <div className="alerta-error">{error}</div>}
          <label htmlFor="comentario" className="etiqueta">Escribir mensaje</label>
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