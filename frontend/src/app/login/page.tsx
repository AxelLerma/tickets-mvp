"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { RUTA_INICIO } from "@/lib/roles";
import type { Usuario } from "@/lib/tipos";

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    setEnviando(true);
    try {
      const r = await api<{ usuario: Usuario }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ correo: datos.get("correo"), password: datos.get("password") }),
      });
      router.replace(RUTA_INICIO[r.usuario.rol]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible iniciar sesión.");
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-widest text-suave">Instituto Electoral del Estado de Querétaro</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">Sistema interno de soporte</h1>
        </div>

        <form onSubmit={enviar} className="panel space-y-5 p-6">
          {error && <div className="alerta-error">{error}</div>}
          <div>
            <label htmlFor="correo" className="etiqueta">
              Correo electrónico
            </label>
            <input id="correo" name="correo" type="email" autoComplete="username" required autoFocus className="entrada" />
          </div>
          <div>
            <label htmlFor="password" className="etiqueta">
              Contraseña
            </label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="entrada" />
          </div>
          <button type="submit" disabled={enviando} className="boton w-full">
            {enviando ? "Verificando…" : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </main>
  );
}