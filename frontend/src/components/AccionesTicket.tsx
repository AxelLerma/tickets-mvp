"use client";

import { useState } from "react";
import { api, useAccion } from "@/lib/api";
import type { Acciones } from "@/lib/tipos";

export function AccionesTicket({ ticketId, acciones, recargar }: { ticketId: number; acciones: Acciones; recargar: () => void }) {
  const { error, ocupado, ejecutar } = useAccion(recargar);
  const [modo, setModo] = useState<"reabrir" | "cancelar" | null>(null);
  const [motivo, setMotivo] = useState("");

  if (!acciones.reabrir && !acciones.cancelar) return null;

  const titulo = modo === "reabrir" ? "Motivo de la reapertura" : "Motivo de la cancelación";

  return (
    <section className="panel space-y-3 p-5">
      {error && <div className="alerta-error">{error}</div>}
      {!modo ? (
        <div className="flex flex-wrap gap-3">
          {acciones.reabrir && (
            <button onClick={() => setModo("reabrir")} className="boton-secundario">
              Reabrir ticket
            </button>
          )}
          {acciones.cancelar && (
            <button onClick={() => setModo("cancelar")} className="boton-secundario">
              Cancelar ticket
            </button>
          )}
        </div>
      ) : (
        <>
          <label htmlFor="motivo" className="etiqueta">{titulo}</label>
          <textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={1000} className="entrada" />
          <div className="flex gap-3">
            <button
              disabled={ocupado || motivo.trim().length < 5}
              onClick={() => ejecutar(() => api(`/tickets/${ticketId}/${modo}`, { method: "POST", body: JSON.stringify({ motivo }) }))}
              className="boton"
            >
              Confirmar
            </button>
            <button
              onClick={() => {
                setModo(null);
                setMotivo("");
              }}
              className="boton-secundario"
            >
              Volver
            </button>
          </div>
        </>
      )}
    </section>
  );
}