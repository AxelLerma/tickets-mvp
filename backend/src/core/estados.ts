export const ESTADOS = {
  NUEVO: "nuevo",
  ASIGNADO: "asignado",
  EN_PROCESO: "en_proceso",
  LISTO_PARA_CERRAR: "listo_para_cerrar",
  CERRADO: "cerrado",
  REABIERTO: "reabierto",
  CANCELADO: "cancelado",
} as const;

export const ESTADOS_ABIERTOS = [
  ESTADOS.NUEVO,
  ESTADOS.ASIGNADO,
  ESTADOS.EN_PROCESO,
  ESTADOS.LISTO_PARA_CERRAR,
  ESTADOS.REABIERTO,
];

// Constantes internas (no vienen del usuario), por eso es seguro interpolarlas en SQL.
export const SQL_ESTADOS_ABIERTOS = ESTADOS_ABIERTOS.map((e) => `'${e}'`).join(", ");

export const PRIORIDAD_POR_IMPACTO = {
  solo_yo: "baja",
  varias_personas: "normal",
  operacion_detenida: "alta",
} as const;

// Provisional: la meta real por prioridad es una decision pendiente del documento.
export const HORAS_OBJETIVO = { alta: 4, normal: 24, baja: 72 } as const;

export type Impacto = keyof typeof PRIORIDAD_POR_IMPACTO;

export const VENTANA_REAPERTURA_HORAS = 48;

// El documento recomienda 100; se reduce a 30. Si se cambia aqui, cambiar tambien MIN_ENCONTRO en PanelTecnico.tsx.
export const MIN_COMO_SE_ENCONTRO = 30;

export const esUnoDe = (valor: string, ...lista: string[]) => lista.includes(valor);

/** Matriz de transiciones validas. Cualquier otro cambio de estado se rechaza. */
export const TRANSICIONES: Record<string, string[]> = {
  [ESTADOS.NUEVO]: [ESTADOS.ASIGNADO, ESTADOS.CANCELADO],
  [ESTADOS.ASIGNADO]: [ESTADOS.EN_PROCESO, ESTADOS.CANCELADO],
  [ESTADOS.EN_PROCESO]: [ESTADOS.LISTO_PARA_CERRAR, ESTADOS.CANCELADO],
  [ESTADOS.LISTO_PARA_CERRAR]: [ESTADOS.CERRADO, ESTADOS.CANCELADO],
  [ESTADOS.CERRADO]: [ESTADOS.REABIERTO],
  [ESTADOS.REABIERTO]: [ESTADOS.EN_PROCESO, ESTADOS.CANCELADO],
  [ESTADOS.CANCELADO]: [],
};