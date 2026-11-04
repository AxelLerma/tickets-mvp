import { Router } from "express";
import { z } from "zod";
import { ErrorNegocio } from "../core/errores";
import { ESTADOS } from "../core/estados";
import { consultar } from "../db/connection";
import { autenticar, requiereRol } from "../middleware/auth";
import { aCsv, aPdf } from "../services/exportacion.service";
import { fechaHora, generarReporte, TIPOS_REPORTE, type Filtros, type TipoReporte } from "../services/reporte.service";

const router = Router();
router.use(autenticar, requiereRol("manager"));

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indique fechas válidas.");
const entero = z.coerce.number({ message: "Filtro no válido." }).int("Filtro no válido.").positive("Filtro no válido.");

const filtrosSchema = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  sedeId: entero.optional(),
  categoriaId: entero.optional(),
  tecnicoId: entero.optional(),
  estado: z.enum(Object.values(ESTADOS) as [string, ...string[]], { message: "Estado no válido." }).optional(),
  prioridad: z.enum(["baja", "normal", "alta"], { message: "Prioridad no válida." }).optional(),
  agrupar: z.enum(["categoria", "sede"], { message: "Agrupación no válida." }).default("categoria"),
});

function hoyLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

function restar(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function filtrosDe(consulta: Record<string, unknown>): Filtros {
  const limpio = Object.fromEntries(Object.entries(consulta).filter(([, v]) => typeof v === "string" && v !== ""));
  const r = filtrosSchema.safeParse(limpio);
  if (!r.success) throw new ErrorNegocio(r.error.issues[0].message);
  const hasta = r.data.hasta ?? hoyLocal();
  const desde = r.data.desde ?? restar(hasta, 30);
  if (Number.isNaN(Date.parse(desde)) || Number.isNaN(Date.parse(hasta))) throw new ErrorNegocio("Indique fechas válidas.");
  if (desde > hasta) throw new ErrorNegocio("La fecha inicial no puede ser posterior a la final.");
  return { ...r.data, desde, hasta };
}

function tipoDe(valor: string | string[] | undefined): TipoReporte {
  if (!TIPOS_REPORTE.includes(valor as TipoReporte)) throw new ErrorNegocio("Reporte no encontrado.", 404);
  return valor as TipoReporte;
}

async function descripcionFiltros(f: Filtros): Promise<string> {
  const partes = [`Del ${f.desde} al ${f.hasta}`];
  if (f.sedeId) partes.push(`Sede: ${(await consultar<{ nombre: string }>("SELECT nombre FROM sedes WHERE id = ?", [f.sedeId]))[0]?.nombre ?? f.sedeId}`);
  if (f.categoriaId) partes.push(`Categoría: ${(await consultar<{ nombre: string }>("SELECT nombre FROM categorias WHERE id = ?", [f.categoriaId]))[0]?.nombre ?? f.categoriaId}`);
  if (f.tecnicoId) partes.push(`Técnico: ${(await consultar<{ nombre: string }>("SELECT nombre FROM usuarios WHERE id = ?", [f.tecnicoId]))[0]?.nombre ?? f.tecnicoId}`);
  if (f.estado) partes.push(`Estado: ${f.estado}`);
  if (f.prioridad) partes.push(`Prioridad: ${f.prioridad}`);
  return partes.join(" · ");
}

router.get("/opciones", async (_req, res) => {
  res.json({
    sedes: await consultar("SELECT id, nombre FROM sedes ORDER BY nombre"),
    categorias: await consultar("SELECT id, nombre FROM categorias ORDER BY nombre"),
    tecnicos: await consultar("SELECT id, nombre FROM usuarios WHERE rol = 'tecnico' ORDER BY nombre"),
  });
});

router.get("/:tipo", async (req, res) => {
  const filtros = filtrosDe(req.query);
  const reporte = await generarReporte(tipoDe(req.params.tipo), filtros);
  res.json({
    ...reporte,
    total: reporte.filas.length,
    filas: reporte.filas.slice(0, 200),
    filtros: await descripcionFiltros(filtros),
    generado: fechaHora(new Date().toISOString()),
  });
});

router.get("/:tipo/exportar", async (req, res) => {
  const filtros = filtrosDe(req.query);
  const formato = req.query.formato === "pdf" ? "pdf" : req.query.formato === "csv" ? "csv" : null;
  if (!formato) throw new ErrorNegocio("Indique el formato: csv o pdf.");

  const reporte = await generarReporte(tipoDe(req.params.tipo), filtros);
  const nombre = `reporte-${reporte.tipo}-${hoyLocal()}.${formato}`;
  const contenido = formato === "csv" ? aCsv(reporte) : await aPdf(reporte, await descripcionFiltros(filtros));

  res.setHeader("Content-Type", formato === "csv" ? "text/csv; charset=utf-8" : "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(contenido);
});

export default router;