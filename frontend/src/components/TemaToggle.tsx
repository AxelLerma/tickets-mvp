"use client";

import { useEffect, useState } from "react";

const CLAVE = "tema";

export function TemaToggle({ className = "" }: { className?: string }) {
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => {
    const leer = () => setOscuro(document.documentElement.classList.contains("oscuro"));
    leer();
    const otraPestana = (e: StorageEvent) => {
      if (e.key !== CLAVE) return;
      document.documentElement.classList.toggle("oscuro", e.newValue === "oscuro");
      leer();
    };
    window.addEventListener("storage", otraPestana);
    return () => window.removeEventListener("storage", otraPestana);
  }, []);

  function alternar() {
    const nuevo = !document.documentElement.classList.contains("oscuro");
    document.documentElement.classList.toggle("oscuro", nuevo);
    try {
      localStorage.setItem(CLAVE, nuevo ? "oscuro" : "claro");
    } catch {
      return;
    } finally {
      setOscuro(nuevo);
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={oscuro ? "Modo claro" : "Modo oscuro"}
      className={`cursor-pointer p-1.5 ${className}`}
    >
      {oscuro ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}