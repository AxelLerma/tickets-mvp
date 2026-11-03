"use client";

import { useEffect, useRef, useState } from "react";
import { api, useAccion } from "@/lib/api";
import { fechaHora } from "@/lib/formato";
import type { Comentario } from "@/lib/tipos";
import { useSesion } from "./SesionProvider";

const ROL: Record<string, { nombre: string; borde: string; texto: string }> = {
  reportante: { nombre: "Reportante", borde: "border-rosa", texto: "text-rosa" },
  tecnico: { nombre: "Técnico", borde: "border-institucional", texto: "text-institucional" },
  manager: { nombre: "Coordinación", borde: "border-ciruela", texto: "text-ciruela" },
  admin: { nombre: "Administración", borde: "border-ciruela", texto: "text-ciruela" },
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
  const conversacion = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = conversacion.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comentarios.length]);

  return (
    <section className="panel p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-suave">Mensajes</h2>
      <p className="mb-3 text-xs text-suave">Conversación del ticket entre reportante, técnico y coordinación.</p>

      <ul ref={conversacion} className="max-h-96 space-y-3 overflow-y-auto rounded-sm border-2 border-borde bg-lavanda p-3">
        {comentarios.length === 0 && <li className="py-4 text-center text-sm text-suave">Aún no hay mensajes.</li>}
        {comentarios.map((c) => {
          if (c.tipo === "sistema") {
            return (
              <li
                key={c.id}
                className="mx-auto w-fit max-w-[90%] border border-dashed border-ciruela/50 px-3 py-1 text-center text-xs text-suave"
              >
                {c.texto} · {fechaHora(c.creadoEn)}
              </li>
            );
          }
          const mio = c.autorId === usuario.id;
          const rol = ROL[c.rolAutor ?? "manager"];
          return (
            <li key={c.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg border-2 bg-[#ffffff] px-3 py-2 text-sm shadow-[2px_2px_0_rgba(75,35,119,0.25)] ${rol.borde} ${
                  mio ? "rounded-br-none" : "rounded-bl-none"
                }`}
              >
                <p className="text-xs">
                  <span className={`font-semibold ${rol.texto}`}>{mio ? "Usted" : c.autor}</span>
                  <span className="text-suave">
                    {" "}
                    · {rol.nombre} · {fechaHora(c.creadoEn)}
                  </span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{c.texto}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {puedeComentar && (
        <div className="mt-4 space-y-2">
          {error && <div className="alerta-error">{error}</div>}
          <label htmlFor="comentario" className="etiqueta">
            Escribir mensaje
          </label>
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