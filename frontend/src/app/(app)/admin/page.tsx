"use client";

import { useState, type FormEvent } from "react";
import { useSesion } from "@/components/SesionProvider";
import { api, useApi } from "@/lib/api";
import type { Rol } from "@/lib/tipos";

interface UsuarioAdmin {
  id: number;
  nombre: string;
  correo: string;
  telefono: string;
  rol: Rol;
  regionId: number | null;
  region: string | null;
  grupoId: number | null;
  grupo: string | null;
  activo: boolean;
}
interface Opcion {
  id: number;
  nombre: string;
}
interface Datos {
  usuarios: UsuarioAdmin[];
  regiones: Opcion[];
  grupos: Opcion[];
}

const NOMBRE_ROL: Record<Rol, string> = {
  reportante: "Reportante",
  tecnico: "Técnico",
  manager: "Coordinación (manager)",
  admin: "Administración",
};

type Modo =
  | { tipo: "nuevo" }
  | { tipo: "editar"; usuario: UsuarioAdmin }
  | { tipo: "password"; usuario: UsuarioAdmin }
  | null;

function FormUsuario({
  existente,
  regiones,
  grupos,
  esYo,
  onListo,
  onCancelar,
  setModoPadre,
  onEliminar,
}: {
  existente?: UsuarioAdmin;
  regiones: Opcion[];
  grupos: Opcion[];
  esYo: boolean;
  onListo: (mensaje: string) => void;
  onCancelar: () => void;
  setModoPadre: (modo: Modo) => void;
  onEliminar: (id: number) => void;
}) {
  const [rol, setRol] = useState<Rol>(existente?.rol ?? "reportante");
  const [activo, setActivo] = useState(existente?.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const regionId = rol === "tecnico" ? Number(f.get("regionId")) || null : null;
    const grupoId = rol === "tecnico" ? Number(f.get("grupoId")) || null : null;
    setError(null);
    setEnviando(true);
    try {
      if (existente) {
        await api(`/admin/usuarios/${existente.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nombre: f.get("nombre"), telefono: f.get("telefono"), rol, regionId, grupoId, activo }),
        });
      } else {
        await api("/admin/usuarios", {
          method: "POST",
          body: JSON.stringify({
            nombre: f.get("nombre"),
            correo: f.get("correo"),
            telefono: f.get("telefono"),
            password: f.get("password"),
            rol,
            regionId,
            grupoId,
          }),
        });
      }
      onListo(existente ? "Cambios guardados." : "Usuario creado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible guardar.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="panel space-y-5 p-6">
      <h2 className="text-base font-semibold">{existente ? `Editar: ${existente.correo}` : "Nuevo usuario"}</h2>
      {error && <div className="alerta-error">{error}</div>}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="nombre" className="etiqueta">Nombre completo</label>
          <input id="nombre" name="nombre" required maxLength={120} defaultValue={existente?.nombre} className="entrada" />
        </div>
        <div>
          <label htmlFor="telefono" className="etiqueta">Teléfono</label>
          <input id="telefono" name="telefono" maxLength={30} defaultValue={existente?.telefono} className="entrada" />
        </div>
      </div>

      {!existente && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="correo" className="etiqueta">Correo electrónico</label>
            <input id="correo" name="correo" type="email" required className="entrada" />
          </div>
          <div>
            <label htmlFor="password" className="etiqueta">Contraseña inicial</label>
            <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="entrada" />
          </div>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="rol" className="etiqueta">Perfil</label>
          <select id="rol" value={rol} onChange={(e) => setRol(e.target.value as Rol)} disabled={esYo} className="entrada">
            {(Object.keys(NOMBRE_ROL) as Rol[]).map((r) => (
              <option key={r} value={r}>{NOMBRE_ROL[r]}</option>
            ))}
          </select>
        </div>
        {rol === "tecnico" && (
          <>
            <div>
              <label htmlFor="regionId" className="etiqueta">Región de atención</label>
              <select id="regionId" name="regionId" required defaultValue={existente?.regionId ?? ""} className="entrada">
                <option value="" disabled>Seleccione…</option>
                {regiones.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="grupoId" className="etiqueta">
                Grupo técnico <span className="font-normal text-suave">(opcional)</span>
              </label>
              <select id="grupoId" name="grupoId" defaultValue={existente?.grupoId ?? ""} className="entrada">
                <option value="">Sin grupo</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>{g.nombre}</option>
                ))}
              </select>
            </div>
          </>
        )}
        {existente && (
          <div>
            <label htmlFor="activo" className="etiqueta">Estado de la cuenta</label>
            <select id="activo" value={activo ? "1" : "0"} onChange={(e) => setActivo(e.target.value === "1")} disabled={esYo} className="entrada">
              <option value="1">Activa</option>
              <option value="0">Desactivada</option>
            </select>
          </div>
        )}
      </div>
      {esYo && <p className="text-sm text-suave">No puede cambiar su propio perfil ni desactivar su cuenta.</p>}

      {existente && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="password-edit" className="etiqueta">
              Nueva contraseña (dejar vacío para conservar la actual)
            </label>
            <input id="password-edit" name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" className="entrada" />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setModoPadre({ tipo: "password", usuario: existente })}
              className="boton-secundario"
            >
              Usar formulario dedicado
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={enviando} className="boton">{enviando ? "Guardando…" : "Guardar"}</button>
        <button type="button" onClick={onCancelar} className="boton-secundario">Cancelar</button>
        {existente && !esYo && (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `¿Eliminar a ${existente.nombre} (${existente.correo})?\n\n${existente.rol === "tecnico" ? "Los tickets que tenga asignados o cerrados se reabrirán automáticamente para ser reasignados." : "Todos los tickets creados por este reportante se eliminarán permanentemente."}\n\nEsta acción no se puede deshacer.`,
                )
              ) {
                onEliminar(existente.id);
              }
            }}
            className="boton-secundario text-error border-error hover:bg-error hover:text-white"
          >
            Eliminar
          </button>
        )}
      </div>
    </form>
  );
}

function FormPassword({
  usuario,
  onListo,
  onCancelar,
}: {
  usuario: UsuarioAdmin;
  onListo: (mensaje: string) => void;
  onCancelar: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [mostrar, setMostrar] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    setError(null);
    setEnviando(true);
    try {
      await api(`/admin/usuarios/${usuario.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      });
      onListo(`Contraseña de ${usuario.correo} actualizada. Sus sesiones abiertas se cerraron.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible actualizar la contraseña.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="panel space-y-5 p-6">
      <h2 className="text-base font-semibold">Restablecer contraseña: {usuario.nombre}</h2>
      {error && <div className="alerta-error">{error}</div>}
      <div className="max-w-sm">
        <label htmlFor="password" className="etiqueta">Nueva contraseña</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={mostrar ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            className="entrada pr-10"
          />
          <button
            type="button"
            onClick={() => setMostrar(!mostrar)}
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-xs text-suave hover:text-tinta"
          >
            {mostrar ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={enviando} className="boton">{enviando ? "Guardando…" : "Actualizar contraseña"}</button>
        <button type="button" onClick={onCancelar} className="boton-secundario">Cancelar</button>
      </div>
    </form>
  );
}

export default function Usuarios() {
  const { usuario: yo } = useSesion();
  const { datos, error, cargando, recargar } = useApi<Datos>("/admin/usuarios");
  const [modo, setModo] = useState<Modo>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorAdmin, setErrorAdmin] = useState<string | null>(null);

  function terminar(mensaje: string) {
    setModo(null);
    setAviso(mensaje);
    recargar();
  }

  async function eliminarUsuario(id: number) {
    try {
      await api(`/admin/usuarios/${id}`, { method: "DELETE" });
      terminar("Usuario eliminado.");
    } catch (err) {
      setAviso(null);
      setErrorAdmin(err instanceof Error ? err.message : "No fue posible eliminar el usuario.");
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-ciruela">Usuarios</h1>
        <button
          onClick={() => {
            setAviso(null);
            setModo({ tipo: "nuevo" });
          }}
          className="boton"
        >
          Nuevo usuario
        </button>
      </div>

      {aviso && <div className="mb-4 border border-institucional/40 bg-aqua-claro px-4 py-3 text-sm text-institucional-oscuro">{aviso}</div>}
      {error && <div className="alerta-error mb-4">{error}</div>}
      {cargando && <p className="text-sm text-suave">Cargando…</p>}

      {datos && modo && (
        <div className="mb-6">
          {modo.tipo === "nuevo" && (
            <FormUsuario
              regiones={datos.regiones}
              grupos={datos.grupos}
              esYo={false}
              onListo={terminar}
              onCancelar={() => setModo(null)}
              setModoPadre={setModo}
              onEliminar={eliminarUsuario}
            />
          )}
          {modo.tipo === "editar" && (
            <FormUsuario
              key={modo.usuario.id}
              existente={modo.usuario}
              regiones={datos.regiones}
              grupos={datos.grupos}
              esYo={modo.usuario.id === yo.id}
              onListo={terminar}
              onCancelar={() => setModo(null)}
              setModoPadre={setModo}
              onEliminar={eliminarUsuario}
            />
          )}
          {modo.tipo === "password" && (
            <FormPassword key={modo.usuario.id} usuario={modo.usuario} onListo={terminar} onCancelar={() => setModo(null)} />
          )}
        </div>
      )}

      {datos && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-institucional text-white border-b-2 border-borde">
              <tr>
                <th className="px-4 py-2.5 text-white font-semibold whitespace-nowrap">Nombre</th>
                <th className="px-4 py-2.5 text-white font-semibold whitespace-nowrap">Correo</th>
                <th className="px-4 py-2.5 text-white font-semibold whitespace-nowrap">Perfil</th>
                <th className="px-4 py-2.5 text-white font-semibold whitespace-nowrap">Región</th>
                <th className="px-4 py-2.5 text-white font-semibold whitespace-nowrap">Grupo</th>
                <th className="px-4 py-2.5 text-white font-semibold whitespace-nowrap">Estado</th>
                <th className="px-4 py-2.5 text-white font-semibold whitespace-nowrap"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {datos.usuarios.map((u) => (
                <tr key={u.id} className={u.activo ? "" : "text-suave"}>
                  <td className="whitespace-nowrap px-4 py-2">{u.nombre}</td>
                  <td className="px-4 py-2">{u.correo}</td>
                  <td className="whitespace-nowrap px-4 py-2">{NOMBRE_ROL[u.rol]}</td>
                  <td className="px-4 py-2">{u.region ?? "—"}</td>
                  <td className="px-4 py-2">{u.grupo ?? "—"}</td>
                  <td className="px-4 py-2">{u.activo ? "Activa" : "Desactivada"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      onClick={() => { setAviso(null); setModo({ tipo: "editar", usuario: u }); }}
                      className="cursor-pointer text-institucional underline underline-offset-2"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => { setAviso(null); setModo({ tipo: "password", usuario: u }); }}
                      className="ml-2 cursor-pointer text-institucional underline underline-offset-2"
                    >
                      Contraseña
                    </button>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `¿Eliminar a ${u.nombre} (${u.correo})?\n\n${u.rol === "tecnico" ? "Los tickets que tenga asignados o cerrados se reabrirán automáticamente para ser reasignados." : "Todos los tickets creados por este reportante se eliminarán permanentemente."}\n\nEsta acción no se puede deshacer.`,
                          )
                        ) {
                          eliminarUsuario(u.id);
                        }
                      }}
                      className="ml-2 cursor-pointer text-error border-error hover:bg-error hover:text-white underline underline-offset-2"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}