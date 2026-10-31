"use client";

import { useEffect, useState } from "react";

/** Mide el tiempo del paso en curso y entrega los minutos al detenerse. */
export function Cronometro({ alDetener }: { alDetener: (minutos: number) => void }) {
  const [inicio, setInicio] = useState<number | null>(null);
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    if (inicio === null) return;
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => clearInterval(id);
  }, [inicio]);

  function detener() {
    if (inicio === null) return;
    const total = Math.floor((Date.now() - inicio) / 1000);
    setInicio(null);
    setSegundos(0);
    alDetener(Math.max(1, Math.round(total / 60)));
  }

  const mm = String(Math.floor(segundos / 60)).padStart(2, "0");
  const ss = String(segundos % 60).padStart(2, "0");

  return (
    <div className="flex items-center gap-3">
      <span className="w-16 font-mono text-lg tabular-nums">
        {mm}:{ss}
      </span>
      {inicio === null ? (
        <button type="button" onClick={() => setInicio(Date.now())} className="boton-secundario">
          Iniciar cronómetro
        </button>
      ) : (
        <button type="button" onClick={detener} className="boton">
          Detener y usar tiempo
        </button>
      )}
    </div>
  );
}