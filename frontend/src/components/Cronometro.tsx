"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Temporizador automático del paso en curso. Arranca solo al abrir el formulario
 * y recuerda su inicio aunque se recargue la página.
 */
export function useTemporizador(clave: string) {
  const [inicio, setInicio] = useState<number | null>(null);
  const [ahora, setAhora] = useState(0);

  useEffect(() => {
    let guardado: number | null = null;
    try {
      const valor = localStorage.getItem(clave);
      guardado = valor ? Number(valor) : null;
    } catch {
      // sin almacenamiento local el reloj arranca desde cero
    }
    const arranque = guardado && !Number.isNaN(guardado) ? guardado : Date.now();
    try {
      localStorage.setItem(clave, String(arranque));
    } catch {
      // se ignora
    }
    setInicio(arranque);
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [clave]);

  const reiniciar = useCallback(() => {
    const t = Date.now();
    try {
      localStorage.setItem(clave, String(t));
    } catch {
      // se ignora
    }
    setInicio(t);
    setAhora(t);
  }, [clave]);

  const segundos = inicio ? Math.max(0, Math.floor((ahora - inicio) / 1000)) : 0;
  return { segundos, minutos: Math.max(1, Math.round(segundos / 60)), reiniciar };
}

export function formatoReloj(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${dos(m)}:${dos(s)}`;
}