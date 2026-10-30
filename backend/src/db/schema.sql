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
  activo INTEGER NOT NULL DEFAULT 1
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