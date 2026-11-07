import { SQL_ESTADOS_ABIERTOS } from "../core/estados";
import { consultar } from "../db/connection";

export const TIPOS_REPORTE = ["cerrados", "carga", "actividades", "reaperturas", "cumplimiento"] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];

export interface Filtros {
  desde: string;
  hasta: string;
  sedeId?: number;
  categoriaId?: number;
  tecnicoId?: number;
  estado?: string;
  prioridad?: string;
  agrupar: "categoria" | "sede";
}

export interface Columna {
  clave: string;
  titulo: string;
  ancho: number;
}

export type Fila = Record<string, string | number>;

export interface Reporte {
  tipo: TipoReporte;
  titulo: string;
  descripcion: string;
  columnas: Columna[];
  filas: Fila[];
  resumen: string | null;
}

const ZONA = "America/Mexico_City";
const LIMITE = 5000;
const INICIO = `((?::date)::timestamp AT TIME ZONE '${ZONA}')`;
const FIN = `(((?::date) + 1)::timestamp AT TIME ZONE '${ZONA}')`;

class Condiciones {
  private partes: string[] = [];
  readonly params: unknown[] = [];

  agregar(sql: string, ...valores: unknown[]): this {
    this.partes.push(sql);
    this.params.push(...valores);
    return this;
  }

  rango(columna: string, f: Filtros): this {
    return this.agregar(`${columna} >= ${INICIO}`, f.desde).agregar(`${columna} < ${FIN}`, f.hasta);
  }

  ticket(f: Filtros, opciones: { tecnico?: boolean; estado?: boolean } = {}): this {
    const { tecnico = true, estado = true } = opciones;
    if (f.sedeId) this.agregar("t.sede_id = ?", f.sedeId);
    if (f.categoriaId) this.agregar("t.categoria_id = ?", f.categoriaId);
    if (tecnico && f.tecnicoId) this.agregar("t.tecnico_id = ?", f.tecnicoId);
    if (estado && f.estado) this.agregar("t.estado = ?", f.estado);
    if (f.prioridad) this.agregar("t.prioridad = ?", f.prioridad);
    return this;
  }

  get donde(): string {
    return this.partes.length ? `WHERE ${this.partes.join(" AND ")}` : "";
  }
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: ZONA }).format(new Date(iso));
}

const horas = (minutos: number) => Number((minutos / 60).toFixed(1));
const ETIQUETA_ESTADO: Record<string, string> = {
  nuevo: "Nuevo",
  asignado: "Asignado",
  en_proceso: "En proceso",
  listo_para_cerrar: "Listo para cerrar",
  cerrado: "Cerrado",
  reabierto: "Reabierto",
  cancelado: "Cancelado",
};
const ETIQUETA_PRIORIDAD: Record<string, string> = { baja: "Baja", normal: "Normal", alta: "Alta" };

async function cerrados(f: Filtros): Promise<Reporte> {
  const c = new Condiciones().rango("t.cerrado_en", f).ticket(f);
  const filas = await consultar<{
    folio: string;
    cerradoEn: string;
    categoria: string;
    sede: string;
    area: string;
    tecnico: string | null;
    prioridad: string;
    resumen: string | null;
    evidencias: number;
    estado: string;
  }>(
    `SELECT t.folio, t.cerrado_en, cat.nombre AS categoria, s.nombre AS sede, t.area,
            tec.nombre AS tecnico, t.prioridad, t.estado,
            COALESCE(i.que_se_hizo,
              (SELECT x.valor_nuevo->>'queSeHizo' FROM bitacora_auditoria x
                WHERE x.entidad = 'ticket' AND x.entidad_id = t.id AND x.evento = 'cierre'
                ORDER BY x.id DESC LIMIT 1)) AS resumen,
            (SELECT COUNT(*) FROM ticket_evidencias e WHERE e.ticket_id = t.id AND e.reemplazada_por_id IS NULL) AS evidencias
       FROM tickets t
       JOIN categorias cat ON cat.id = t.categoria_id
       JOIN sedes s ON s.id = t.sede_id
       LEFT JOIN usuarios tec ON tec.id = t.tecnico_id
       LEFT JOIN ticket_intervencion i ON i.ticket_id = t.id
       ${c.donde}
      ORDER BY t.cerrado_en DESC LIMIT ${LIMITE}`,
    c.params,
  );
  return {
    tipo: "cerrados",
    titulo: "Historial de tickets cerrados",
    descripcion: "Antecedente de intervenciones concluidas. El rango de fechas aplica a la fecha de cierre.",
    columnas: [
      { clave: "folio", titulo: "Folio", ancho: 1.3 },
      { clave: "cierre", titulo: "Cierre", ancho: 1.3 },
      { clave: "categoria", titulo: "Categoría", ancho: 1.4 },
      { clave: "ubicacion", titulo: "Ubicación", ancho: 2 },
      { clave: "tecnico", titulo: "Técnico", ancho: 1.4 },
      { clave: "prioridad", titulo: "Prioridad", ancho: 0.9 },
      { clave: "resumen", titulo: "Resumen", ancho: 3 },
      { clave: "evidencias", titulo: "Evid.", ancho: 0.6 },
      { clave: "estado", titulo: "Estado", ancho: 1 },
    ],
    filas: filas.map((r) => ({
      folio: r.folio,
      cierre: fechaHora(r.cerradoEn),
      categoria: r.categoria,
      ubicacion: `${r.sede} · ${r.area}`,
      tecnico: r.tecnico ?? "—",
      prioridad: ETIQUETA_PRIORIDAD[r.prioridad],
      resumen: r.resumen ?? "—",
      evidencias: r.evidencias,
      estado: ETIQUETA_ESTADO[r.estado],
    })),
    resumen: `${filas.length} ticket(s) cerrados en el periodo.`,
  };
}

async function carga(f: Filtros): Promise<Reporte> {
  const porTecnico = async (sql: string, c: Condiciones) =>
    consultar<{ tecnicoId: number; n: number; vencidos?: number; minutos?: number }>(sql, c.params);

  const cAsig = new Condiciones().agregar("t.tecnico_id IS NOT NULL").rango("t.asignado_en", f).ticket(f, { tecnico: false, estado: false });
  const asignados = await porTecnico(
    `SELECT t.tecnico_id, COUNT(*) AS n FROM tickets t ${cAsig.donde} GROUP BY t.tecnico_id`,
    cAsig,
  );
  const cActivos = new Condiciones()
    .agregar(`t.estado IN (${SQL_ESTADOS_ABIERTOS})`)
    .agregar("t.tecnico_id IS NOT NULL")
    .ticket(f, { tecnico: false, estado: false });
  const activos = await porTecnico(
    `SELECT t.tecnico_id, COUNT(*) AS n, COUNT(*) FILTER (WHERE t.fecha_objetivo < NOW()) AS vencidos
       FROM tickets t ${cActivos.donde} GROUP BY t.tecnico_id`,
    cActivos,
  );
  const cMin = new Condiciones().rango("p.creado_en", f).ticket(f, { tecnico: false, estado: false });
  const minutos = await porTecnico(
    `SELECT p.tecnico_id, SUM(p.minutos) AS minutos
       FROM ticket_troubleshooting p JOIN tickets t ON t.id = p.ticket_id
       ${cMin.donde} GROUP BY p.tecnico_id`,
    cMin,
  );
  const cCerr = new Condiciones().agregar("t.tecnico_id IS NOT NULL").rango("t.cerrado_en", f).ticket(f, { tecnico: false, estado: false });
  const cerradosPorTecnico = await porTecnico(
    `SELECT t.tecnico_id, COUNT(*) AS n FROM tickets t ${cCerr.donde} GROUP BY t.tecnico_id`,
    cCerr,
  );

  const tecnicos = await consultar<{ id: number; nombre: string; region: string | null }>(
    `SELECT u.id, u.nombre, r.nombre AS region FROM usuarios u LEFT JOIN regiones r ON r.id = u.region_id
      WHERE u.rol = 'tecnico' ${f.tecnicoId ? "AND u.id = ?" : ""} ORDER BY u.nombre`,
    f.tecnicoId ? [f.tecnicoId] : [],
  );

  const filas: Fila[] = tecnicos.map((t) => ({
    tecnico: t.nombre,
    region: t.region ?? "—",
    asignados: asignados.find((x) => x.tecnicoId === t.id)?.n ?? 0,
    activos: activos.find((x) => x.tecnicoId === t.id)?.n ?? 0,
    vencidos: activos.find((x) => x.tecnicoId === t.id)?.vencidos ?? 0,
    horas: horas(minutos.find((x) => x.tecnicoId === t.id)?.minutos ?? 0),
    cerrados: cerradosPorTecnico.find((x) => x.tecnicoId === t.id)?.n ?? 0,
  }));

  return {
    tipo: "carga",
    titulo: "Carga por técnico",
    descripcion: "Asignados, cerrados y horas registradas dentro del rango. Activos y vencidos reflejan el estado actual.",
    columnas: [
      { clave: "tecnico", titulo: "Técnico", ancho: 2 },
      { clave: "region", titulo: "Región", ancho: 1.2 },
      { clave: "asignados", titulo: "Asignados", ancho: 1 },
      { clave: "activos", titulo: "Activos", ancho: 1 },
      { clave: "vencidos", titulo: "Vencidos", ancho: 1 },
      { clave: "horas", titulo: "Horas registradas", ancho: 1.3 },
      { clave: "cerrados", titulo: "Cerrados", ancho: 1 },
    ],
    filas,
    resumen: `${tecnicos.length} técnico(s). Total de horas registradas: ${horas(minutos.reduce((s, m) => s + (m.minutos ?? 0), 0))}.`,
  };
}

function desplazar(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function dias(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
}

async function actividades(f: Filtros): Promise<Reporte> {
  const grupo = f.agrupar === "sede" ? "s.nombre" : "cat.nombre";
  const consulta = async (desde: string, hasta: string) => {
    const c = new Condiciones().rango("t.creado_en", { ...f, desde, hasta }).ticket(f);
    return consultar<{ grupo: string; total: number; cerrados: number; abiertos: number; folios: string[] }>(
      `SELECT ${grupo} AS grupo, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE t.estado = 'cerrado') AS cerrados,
              COUNT(*) FILTER (WHERE t.estado IN (${SQL_ESTADOS_ABIERTOS})) AS abiertos,
              (array_agg(t.folio ORDER BY t.creado_en DESC))[1:5] AS folios
         FROM tickets t
         JOIN categorias cat ON cat.id = t.categoria_id
         JOIN sedes s ON s.id = t.sede_id
         ${c.donde}
        GROUP BY ${grupo} ORDER BY total DESC, grupo LIMIT ${LIMITE}`,
      c.params,
    );
  };

  const largo = dias(f.desde, f.hasta);
  const actual = await consulta(f.desde, f.hasta);
  const previo = await consulta(desplazar(f.desde, -largo), desplazar(f.desde, -1));

  const tendencia = (total: number, antes: number | undefined) => {
    if (!antes) return "Nuevo";
    const cambio = Math.round(((total - antes) / antes) * 100);
    return cambio === 0 ? "Sin cambio" : `${cambio > 0 ? "+" : ""}${cambio} %`;
  };

  return {
    tipo: "actividades",
    titulo: f.agrupar === "sede" ? "Actividades por sede" : "Actividades por categoría",
    descripcion: "Volumen de tickets creados en el rango y tendencia contra el periodo anterior de la misma duración.",
    columnas: [
      { clave: "grupo", titulo: f.agrupar === "sede" ? "Sede" : "Categoría", ancho: 2 },
      { clave: "total", titulo: "Tickets", ancho: 0.9 },
      { clave: "cerrados", titulo: "Cerrados", ancho: 0.9 },
      { clave: "abiertos", titulo: "Abiertos", ancho: 0.9 },
      { clave: "tendencia", titulo: "Tendencia", ancho: 1.1 },
      { clave: "folios", titulo: "Tickets recientes", ancho: 3.5 },
    ],
    filas: actual.map((r) => ({
      grupo: r.grupo,
      total: r.total,
      cerrados: r.cerrados,
      abiertos: r.abiertos,
      tendencia: tendencia(r.total, previo.find((p) => p.grupo === r.grupo)?.total),
      folios: (r.folios ?? []).join(", "),
    })),
    resumen: `${actual.reduce((s, r) => s + r.total, 0)} ticket(s) en el periodo; ${previo.reduce((s, r) => s + r.total, 0)} en el periodo anterior.`,
  };
}

async function reaperturas(f: Filtros): Promise<Reporte> {
  const c = new Condiciones().agregar("b.entidad = 'ticket'").agregar("b.evento = 'reapertura'").rango("b.fecha", f).ticket(f);
  const filas = await consultar<{
    fecha: string;
    motivo: string | null;
    folio: string;
    titulo: string;
    categoria: string;
    sede: string;
    tecnico: string | null;
    cierrePrevio: string | null;
  }>(
    `SELECT b.fecha, b.comentario AS motivo, t.folio, t.titulo, cat.nombre AS categoria, s.nombre AS sede, tec.nombre AS tecnico,
            (SELECT MAX(x.fecha) FROM bitacora_auditoria x
              WHERE x.entidad = 'ticket' AND x.entidad_id = t.id AND x.evento = 'cierre' AND x.fecha < b.fecha) AS cierre_previo
       FROM bitacora_auditoria b
       JOIN tickets t ON t.id = b.entidad_id
       JOIN categorias cat ON cat.id = t.categoria_id
       JOIN sedes s ON s.id = t.sede_id
       LEFT JOIN usuarios tec ON tec.id = t.tecnico_id
       ${c.donde}
      ORDER BY b.fecha DESC LIMIT ${LIMITE}`,
    c.params,
  );
  return {
    tipo: "reaperturas",
    titulo: "Reaperturas",
    descripcion: "Tickets reabiertos en el rango, con el motivo y el tiempo transcurrido desde su cierre.",
    columnas: [
      { clave: "folio", titulo: "Ticket original", ancho: 1.4 },
      { clave: "titulo", titulo: "Título", ancho: 2.2 },
      { clave: "reapertura", titulo: "Reapertura", ancho: 1.3 },
      { clave: "motivo", titulo: "Motivo", ancho: 2.6 },
      { clave: "tecnico", titulo: "Técnico", ancho: 1.4 },
      { clave: "categoria", titulo: "Categoría", ancho: 1.4 },
      { clave: "desdeCierre", titulo: "Horas desde el cierre", ancho: 1.3 },
    ],
    filas: filas.map((r) => ({
      folio: r.folio,
      titulo: r.titulo,
      reapertura: fechaHora(r.fecha),
      motivo: r.motivo ?? "—",
      tecnico: r.tecnico ?? "—",
      categoria: r.categoria,
      desdeCierre: r.cierrePrevio ? Number(((Date.parse(r.fecha) - Date.parse(r.cierrePrevio)) / 3_600_000).toFixed(1)) : "—",
    })),
    resumen: `${filas.length} reapertura(s) en el periodo.`,
  };
}

async function cumplimiento(f: Filtros): Promise<Reporte> {
  const c = new Condiciones().agregar("t.estado <> 'cancelado'").rango("t.creado_en", f).ticket(f);
  const filas = await consultar<{
    folio: string;
    titulo: string;
    prioridad: string;
    sede: string;
    tecnico: string | null;
    fechaObjetivo: string;
    cerradoEn: string | null;
    resultado: string;
  }>(
    `SELECT t.folio, t.titulo, t.prioridad, s.nombre AS sede, tec.nombre AS tecnico, t.fecha_objetivo,
            CASE WHEN t.estado = 'cerrado' THEN t.cerrado_en END AS cerrado_en,
            CASE WHEN t.estado = 'cerrado' AND t.cerrado_en <= t.fecha_objetivo THEN 'En tiempo'
                 WHEN t.estado = 'cerrado' THEN 'Fuera de tiempo'
                 WHEN NOW() > t.fecha_objetivo THEN 'Vencido (abierto)'
                 ELSE 'En curso' END AS resultado
       FROM tickets t
       JOIN sedes s ON s.id = t.sede_id
       LEFT JOIN usuarios tec ON tec.id = t.tecnico_id
       ${c.donde}
      ORDER BY t.creado_en DESC LIMIT ${LIMITE}`,
    c.params,
  );
  const enTiempo = filas.filter((r) => r.resultado === "En tiempo").length;
  const cerradosTotal = filas.filter((r) => r.resultado === "En tiempo" || r.resultado === "Fuera de tiempo").length;
  return {
    tipo: "cumplimiento",
    titulo: "Cumplimiento de fechas objetivo",
    descripcion: "Tickets creados en el rango (sin cancelados) y si se cerraron dentro de su fecha objetivo.",
    columnas: [
      { clave: "folio", titulo: "Folio", ancho: 1.3 },
      { clave: "titulo", titulo: "Título", ancho: 2.4 },
      { clave: "prioridad", titulo: "Prioridad", ancho: 0.9 },
      { clave: "sede", titulo: "Sede", ancho: 1.5 },
      { clave: "tecnico", titulo: "Técnico", ancho: 1.4 },
      { clave: "objetivo", titulo: "Fecha objetivo", ancho: 1.3 },
      { clave: "cierre", titulo: "Cierre", ancho: 1.3 },
      { clave: "resultado", titulo: "Resultado", ancho: 1.3 },
    ],
    filas: filas.map((r) => ({
      folio: r.folio,
      titulo: r.titulo,
      prioridad: ETIQUETA_PRIORIDAD[r.prioridad],
      sede: r.sede,
      tecnico: r.tecnico ?? "—",
      objetivo: fechaHora(r.fechaObjetivo),
      cierre: fechaHora(r.cerradoEn),
      resultado: r.resultado,
    })),
    resumen: cerradosTotal
      ? `Cumplimiento: ${Math.round((enTiempo / cerradosTotal) * 100)} % (${enTiempo} de ${cerradosTotal} cerrados en tiempo).`
      : "Aún no hay tickets cerrados en el periodo.",
  };
}

export function generarReporte(tipo: TipoReporte, filtros: Filtros): Promise<Reporte> {
  switch (tipo) {
    case "cerrados":
      return cerrados(filtros);
    case "carga":
      return carga(filtros);
    case "actividades":
      return actividades(filtros);
    case "reaperturas":
      return reaperturas(filtros);
    case "cumplimiento":
      return cumplimiento(filtros);
  }
}