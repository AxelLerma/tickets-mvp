import { ETIQUETAS_ESTADO } from "@/lib/formato";

const ESTILOS_ESTADO: Record<string, string> = {
  nuevo: "border-[#cbbfdc] bg-[#e6dff0] text-[#4b3f60]",
  asignado: "border-[#c8aee6] bg-[#e4d5f5] text-[#4a1f78]",
  en_proceso: "border-[#eaaccb] bg-[#f8d8e8] text-[#8c1f5c]",
  listo_para_cerrar: "border-[#98cdd0] bg-[#cfe9ea] text-[#0a4a51]",
  cerrado: "border-institucional bg-institucional text-white",
  reabierto: "border-rosa bg-rosa text-white",
  cancelado: "border-[#cfc7da] bg-[#e1dce8] text-[#756a85]",
};

export function InsigniaEstado({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        ESTILOS_ESTADO[estado] ?? ESTILOS_ESTADO.nuevo
      }`}
    >
      {ETIQUETAS_ESTADO[estado] ?? estado}
    </span>
  );
}

const ESTILOS_PRIORIDAD: Record<string, string> = {
  alta: "text-[#b0206a]",
  normal: "text-[#6b3a9a]",
  baja: "text-institucional",
};

export function Prioridad({ valor }: { valor: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${ESTILOS_PRIORIDAD[valor]}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      <span className="capitalize">{valor}</span>
    </span>
  );
}