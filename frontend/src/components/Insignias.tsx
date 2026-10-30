import { ETIQUETAS_ESTADO } from "@/lib/formato";

const ESTILOS_ESTADO: Record<string, string> = {
  nuevo: "border-stone-300 bg-stone-100 text-stone-700",
  asignado: "border-indigo-200 bg-indigo-50 text-indigo-800",
  en_proceso: "border-amber-200 bg-amber-50 text-amber-800",
  listo_para_cerrar: "border-teal-200 bg-teal-50 text-teal-800",
  cerrado: "border-emerald-200 bg-emerald-50 text-emerald-800",
  reabierto: "border-red-200 bg-red-50 text-red-800",
  cancelado: "border-stone-300 bg-stone-100 text-stone-500",
};

export function InsigniaEstado({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium ${
        ESTILOS_ESTADO[estado] ?? ESTILOS_ESTADO.nuevo
      }`}
    >
      {ETIQUETAS_ESTADO[estado] ?? estado}
    </span>
  );
}

const ESTILOS_PRIORIDAD: Record<string, string> = {
  alta: "text-red-700",
  normal: "text-amber-700",
  baja: "text-emerald-700",
};

export function Prioridad({ valor }: { valor: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${ESTILOS_PRIORIDAD[valor]}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      <span className="capitalize">{valor}</span>
    </span>
  );
}