"use client";

import { useEffect, useState } from "react";

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    public estado: number,
  ) {
    super(mensaje);
  }
}

export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const respuesta = await fetch(`/api${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...opciones.headers },
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new ErrorApi(datos.error ?? "Ocurrió un error inesperado.", respuesta.status);
  }
  return datos as T;
}

/** Carga datos al abrir la pantalla y expone el estado de la petición. */
export function useApi<T>(ruta: string) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    api<T>(ruta)
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch((e: Error) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [ruta]);

  return { datos, error, cargando: !datos && !error };
}