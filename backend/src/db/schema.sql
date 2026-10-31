CREATE TABLE IF NOT EXISTS regiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sedes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  region_id INTEGER NOT NULL REFERENCES regiones(id),
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  correo TEXT NOT NULL UNIQUE,
  telefono TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('reportante', 'tecnico', 'manager', 'admin')),
  region_id INTEGER REFERENCES regiones(id),
  activo INTEGER NOT NULL DEFAULT 1,
  sesion_version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT UNIQUE,
  titulo TEXT NOT NULL,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  sede_id INTEGER NOT NULL REFERENCES sedes(id),
  area TEXT NOT NULL,
  equipo_activo TEXT,
  descripcion TEXT NOT NULL,
  impacto TEXT NOT NULL CHECK (impacto IN ('solo_yo', 'varias_personas', 'operacion_detenida')),
  prioridad TEXT NOT NULL CHECK (prioridad IN ('baja', 'normal', 'alta')),
  estado TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN
    ('nuevo', 'asignado', 'en_proceso', 'listo_para_cerrar', 'cerrado', 'reabierto', 'cancelado')),
  reportante_id INTEGER NOT NULL REFERENCES usuarios(id),
  tecnico_id INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  asignado_en TEXT,
  iniciado_en TEXT,
  cerrado_en TEXT,
  reabierto_en TEXT,
  fecha_objetivo TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets(estado);
CREATE INDEX IF NOT EXISTS idx_tickets_reportante ON tickets(reportante_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tecnico ON tickets(tecnico_id);

CREATE TABLE IF NOT EXISTS bitacora_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  entidad TEXT NOT NULL,
  entidad_id INTEGER NOT NULL,
  evento TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  comentario TEXT
);

-- La bitácora es inmutable: la propia base rechaza cualquier edición o borrado.
CREATE TRIGGER IF NOT EXISTS bitacora_sin_update
BEFORE UPDATE ON bitacora_auditoria
BEGIN
  SELECT RAISE(ABORT, 'La bitácora es inmutable');
END;

CREATE TRIGGER IF NOT EXISTS bitacora_sin_delete
BEFORE DELETE ON bitacora_auditoria
BEGIN
  SELECT RAISE(ABORT, 'La bitácora es inmutable');
END;

CREATE TABLE IF NOT EXISTS ticket_intervencion (
  ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id),
  como_se_encontro TEXT,
  que_se_hizo TEXT,
  como_se_dejo TEXT,
  materiales TEXT
);

CREATE TABLE IF NOT EXISTS ticket_troubleshooting (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  tecnico_id INTEGER NOT NULL REFERENCES usuarios(id),
  descripcion_paso TEXT NOT NULL,
  resultado TEXT NOT NULL,
  minutos INTEGER NOT NULL CHECK (minutos > 0),
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pasos_ticket ON ticket_troubleshooting(ticket_id);

CREATE TABLE IF NOT EXISTS ticket_esperas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  motivo TEXT NOT NULL,
  inicio TEXT NOT NULL,
  fin TEXT
);

CREATE TABLE IF NOT EXISTS ticket_comentarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'comentario' CHECK (tipo IN ('comentario', 'sistema')),
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comentarios_ticket ON ticket_comentarios(ticket_id);

CREATE TABLE IF NOT EXISTS ticket_evidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  subido_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  etapa TEXT NOT NULL CHECK (etapa IN ('inicial_reportante', 'inicial_tecnico', 'cierre')),
  nombre_original TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamano_bytes INTEGER NOT NULL,
  ruta_archivo TEXT NOT NULL,
  ruta_miniatura TEXT,
  reemplazada_por_id INTEGER REFERENCES ticket_evidencias(id),
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidencias_ticket ON ticket_evidencias(ticket_id);

-- Ni la evidencia ni el troubleshooting se borran; los pasos tampoco se editan.
CREATE TRIGGER IF NOT EXISTS evidencias_sin_delete
BEFORE DELETE ON ticket_evidencias
BEGIN SELECT RAISE(ABORT, 'La evidencia no se elimina'); END;

CREATE TRIGGER IF NOT EXISTS pasos_sin_update
BEFORE UPDATE ON ticket_troubleshooting
BEGIN SELECT RAISE(ABORT, 'El troubleshooting es inmutable'); END;

CREATE TRIGGER IF NOT EXISTS pasos_sin_delete
BEFORE DELETE ON ticket_troubleshooting
BEGIN SELECT RAISE(ABORT, 'El troubleshooting es inmutable'); END;