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


export function useApi<T>(ruta: string) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    api<T>(ruta)
      .then((respuesta) => {
        if (!vigente) return;
        setDatos(respuesta);
        setError(null);
      })
      .catch((e: Error) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [ruta, version]);

  return { datos, error, cargando: !datos && !error, recargar: () => setVersion((v) => v + 1) };
}


export function useAccion(alTerminar: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function ejecutar(accion: () => Promise<unknown>) {
    setError(null);
    setOcupado(true);
    try {
      await accion();
      alTerminar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible completar la acción.");
    } finally {
      setOcupado(false);
    }
  }

  return { error, ocupado, ejecutar };
}


export function subirArchivo(
  archivo: File,
  campos: Record<string, string>,
  alProgreso?: (porcentaje: number) => void,
): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const datos = new FormData();
    Object.entries(campos).forEach(([clave, valor]) => datos.append(clave, valor));
    datos.append("archivo", archivo);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/evidencias");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) alProgreso?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolver();
      let mensaje = "No fue posible subir el archivo.";
      try {
        mensaje = JSON.parse(xhr.responseText).error ?? mensaje;
      } catch {
        
      }
      rechazar(new ErrorApi(mensaje, xhr.status));
    };
    xhr.onerror = () => rechazar(new ErrorApi("Se perdió la conexión al subir el archivo.", 0));
    xhr.send(datos);
  });
}