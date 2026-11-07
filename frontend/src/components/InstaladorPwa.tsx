"use client";

import { useEffect, useState } from "react";

export default function InstaladorPwa() {
  const [mostrar, setMostrar] = useState(false);
  const [promptEvent, setPromptEvent] = useState<Event | null>(null);
  const [esIOS, setEsIOS] = useState(false);

  useEffect(() => {
    // Evitar ejecutar en el servidor (SSR)
    if (typeof window === "undefined") return;

    // Detectar iOS
    const userAgent = navigator.userAgent;
    const iOS =
      /iPad|iPhone|iPod/.test(userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setEsIOS(iOS);

    // Si ya fue ignorado, no mostrar nada
    if (localStorage.getItem("pwa-ignorado") === "1") {
      setMostrar(false);
      return;
    }

    if (iOS) {
      // Safari en iOS no soporta beforeinstallprompt
      setMostrar(true);
      return;
    }

    // Escuchar evento beforeinstallprompt (Chrome/Android)
    const manejarPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as any);
      setMostrar(true);
    };

    window.addEventListener("beforeinstallprompt", manejarPrompt as EventListener);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        manejarPrompt as EventListener
      );
    };
  }, []);

  const instalar = async () => {
    if (!promptEvent) return;
    try {
      const result = await (promptEvent as any).prompt?.();
      // El resultado puede no estar disponible en todos los navegadores
      setMostrar(false);
    } catch (error) {
      console.error("Error al instalar PWA:", error);
    }
  };

  const ignorar = () => {
    localStorage.setItem("pwa-ignorado", "1");
    setMostrar(false);
  };

  if (!mostrar) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #ddd0ef",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 4px 12px rgba(75, 35, 119, 0.15)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 14, color: "#333" }}>
          {esIOS
            ? "Para instalar la App, toca compartir y 'Agregar a inicio'."
            : "Instala la aplicación de Soporte para un acceso más rápido."}
        </span>
        {!esIOS && (
          <button
            onClick={instalar}
            style={{
              background: "#4b2377",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Instalar
          </button>
        )}
        <button
          onClick={ignorar}
          style={{
            background: "transparent",
            border: "none",
            color: "#666",
            fontSize: 20,
            lineHeight: 1,
            cursor: "pointer",
            padding: 0,
            marginLeft: 8,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}