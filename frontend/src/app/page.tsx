"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { RUTA_INICIO } from "@/lib/roles";
import type { Usuario } from "@/lib/tipos";

export default function Inicio() {
  const router = useRouter();

  useEffect(() => {
    api<{ usuario: Usuario }>("/auth/me")
      .then((r) => router.replace(RUTA_INICIO[r.usuario.rol]))
      .catch(() => router.replace("/login"));
  }, [router]);

  return null;
}