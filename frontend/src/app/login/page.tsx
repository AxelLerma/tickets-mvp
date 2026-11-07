"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TemaToggle } from "@/components/TemaToggle";
import { api } from "@/lib/api";
import { RUTA_INICIO } from "@/lib/roles";
import type { Usuario } from "@/lib/tipos";

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [modo, setModo] = useState<"login" | "recuperar" | null>("login");
  const [errorRecuperar, setErrorRecuperar] = useState<string | null>(null);
  const [avisoRecuperar, setAvisoRecuperar] = useState<string | null>(null);
  const [enviandoRecuperar, setEnviandoRecuperar] = useState(false);

  async function enviarRecuperar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErrorRecuperar(null);
    setAvisoRecuperar(null);
    setEnviandoRecuperar(true);
    try {
      await api("/auth/recuperar", {
        method: "POST",
        body: JSON.stringify({ correo: String(f.get("correo") ?? "").trim() }),
      });
      setAvisoRecuperar("Solicitud enviada. El administrador restablecerá su contraseña.");
    } catch (err) {
      setErrorRecuperar(err instanceof Error ? err.message : "No se pudo enviar la solicitud.");
    } finally {
      setEnviandoRecuperar(false);
    }
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    setEnviando(true);
    try {
      const r = await api<{ usuario: Usuario }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ correo: String(datos.get("correo") ?? "").trim(), password: datos.get("password") }),
      });
      router.replace(RUTA_INICIO[r.usuario.rol]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible iniciar sesión.");
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <section className="flex flex-col justify-between bg-linear-to-br from-ciruela via-[#7b3a96] to-institucional-oscuro px-8 py-10 text-white">
        <p className="text-xs uppercase tracking-[0.25em] text-white/70">Instituto Electoral del Estado de Querétaro</p>
        <div className="py-12">
          <h1 className="text-3xl font-semibold leading-tight lg:text-4xl">Sistema interno de soporte y atención de tickets</h1>
          <p className="mt-4 max-w-md text-sm text-white/80">
            Reporte de incidencias, atención técnica con evidencia y seguimiento de la operación en un solo lugar.
          </p>
        </div>
        <div className="h-1.5 w-24 bg-rosa" />
      </section>

      <section className="relative flex items-center justify-center bg-fondo px-6 py-10">
        <TemaToggle className="absolute right-4 top-4 text-suave hover:text-tinta" />
        <form onSubmit={enviar} className="panel w-full max-w-sm space-y-5 p-7">
          <h2 className="text-lg font-semibold text-ciruela">Iniciar sesión</h2>
          {error && <div className="alerta-error">{error}</div>}
          <div>
            <label htmlFor="correo" className="etiqueta">
              Correo electrónico
            </label>
            <input
              id="correo"
              name="correo"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
              className="entrada"
            />
          </div>
          <div>
            <label htmlFor="password" className="etiqueta">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className="entrada"
            />
          </div>
          <button type="submit" disabled={enviando} className="boton w-full">
            {enviando ? "Verificando…" : "Entrar"}
          </button>
          <button
            type="button"
            onClick={() => setModo("recuperar")}
            className="text-xs text-suave underline underline-offset-2 hover:text-tinta"
          >
            ¿Olvidó su contraseña?
          </button>
        </form>
        {modo === "recuperar" && (
          <form onSubmit={enviarRecuperar} className="panel w-full max-w-sm mt-6 space-y-3 p-4">
            <h3 className="text-sm font-semibold text-ciruela">Recuperación de contraseña</h3>
            {errorRecuperar && <div className="alerta-error text-xs">{errorRecuperar}</div>}
            {avisoRecuperar && <div className="text-xs text-suave">{avisoRecuperar}</div>}
            <label htmlFor="correo-rec" className="etiqueta text-xs">Correo electrónico</label>
            <input id="correo-rec" name="correo" type="email" required className="entrada text-xs" />
            <button type="submit" disabled={enviandoRecuperar} className="boton w-full text-xs">
              {enviandoRecuperar ? "Enviando…" : "Enviar solicitud al administrador"}
            </button>
            <button type="button" onClick={() => setModo(null)} className="boton-secundario w-full text-xs">
              Volver al inicio de sesión
            </button>
          </form>
        )}
      </section>
    </main>
  );
}