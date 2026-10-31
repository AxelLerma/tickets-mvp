import { ETIQUETAS_ESTADO, ETIQUETAS_EVENTO, fechaHora } from "@/lib/formato";
import type { EventoHistorial } from "@/lib/tipos";

export function Historial({ eventos }: { eventos: EventoHistorial[] }) {
  return (
    <section className="panel p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-suave">Bitácora de cambios</h2>
      <ol className="divide-y divide-borde text-sm">
        {eventos.map((ev) => (
          <li key={ev.id} className="py-2">
            <p>
              <span className="font-medium">{ETIQUETAS_EVENTO[ev.evento] ?? ev.evento}</span>
              {ev.evento === "cambio_estado" && (
                <span>
                  {" "}
                  · {ETIQUETAS_ESTADO[String(ev.antes?.estado)] ?? "—"} → {ETIQUETAS_ESTADO[String(ev.despues?.estado)] ?? "—"}
                </span>
              )}
            </p>
            <p className="text-xs text-suave">
              {fechaHora(ev.fecha)} · {ev.usuario ?? "Sistema"}
            </p>
            {ev.comentario && <p className="mt-0.5 text-suave">{ev.comentario}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}