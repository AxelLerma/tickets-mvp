"use client";

import { useState } from "react";
import { api, useAccion, useApi } from "@/lib/api";
import type { Acciones, Catalogos } from "@/lib/tipos";

export function AccionesTicket({ ticketId, acciones, recargar }: { ticketId: number; acciones: Acciones; recargar: () => void }) {
  const { error, ocupado, ejecutar } = useAccion(recargar);
  const { datos: catalogos } = useApi<Catalogos>("/catalogos");
  const [modo, setModo] = useState<"reabrir" | "cancelar" | null>(null);
  const [texto, setTexto] = useState("");
  const [motivoId, setMotivoId] = useState("");

  if (!acciones.reabrir && !acciones.cancelar) return null;

  function volver() {
    setModo(null);
    setTexto("");
    setMotivoId("");
  }

  function confirmar() {
    if (modo === "reabrir") {
      ejecutar(() => api(`/tickets/${ticketId}/reabrir`, { method: "POST", body: JSON.stringify({ motivo: texto }) }));
    } else {
      ejecutar(() =>
        api(`/tickets/${ticketId}/cancelar`, { method: "POST", body: JSON.stringify({ motivoId: Number(motivoId), detalle: texto }) }),
      );
    }
  }

  const puedeConfirmar = modo === "reabrir" ? texto.trim().length >= 5 : motivoId !== "";

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
          {modo === "cancelar" && (
            <div>
              <label htmlFor="motivo-cancelacion" className="etiqueta">
                Motivo de la cancelación
              </label>
              <select id="motivo-cancelacion" value={motivoId} onChange={(e) => setMotivoId(e.target.value)} className="entrada">
                <option value="">Seleccione un motivo…</option>
                {catalogos?.motivos.cancelacion.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label htmlFor="texto-accion" className="etiqueta">
            {modo === "reabrir" ? "Motivo de la reapertura" : "Detalle (opcional)"}
          </label>
          <textarea id="texto-accion" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={1000} className="entrada" />
          <div className="flex gap-3">
            <button disabled={ocupado || !puedeConfirmar} onClick={confirmar} className="boton">
              Confirmar
            </button>
            <button onClick={volver} className="boton-secundario">
              Volver
            </button>
          </div>
        </>
      )}
    </section>
  );
}