# Sistema interno de soporte y atención de tickets

Plataforma web interna para el Instituto Electoral del Estado de Querétaro (IEEQ). Permite reportar
incidencias, atenderlas con evidencia técnica obligatoria al cierre y supervisar la carga de trabajo.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Backend | Node.js, Express 5, TypeScript, Zod |
| Base de datos | PostgreSQL |
| Archivos | Disco privado (`backend/storage`), accesible solo mediante la API |
| Sesión | JWT en cookie HttpOnly, contraseñas con bcrypt |
| Correo | Nodemailer (SMTP) con cola de salida en base de datos |
| Reportes | CSV y PDF (pdfkit) |

## Estructura

```
tickets-mvp/
├── backend/
│   ├── src/
│   │   ├── core/         estados y matriz de transiciones
│   │   ├── db/           conexión, esquema SQL y semilla
│   │   ├── middleware/   autenticación y permisos por rol
│   │   ├── services/     reglas de negocio
│   │   └── routes/       API REST
│   └── scripts/          respaldo
└── frontend/src/
    ├── app/              pantallas por rol
    ├── components/       componentes compartidos
    └── lib/              API, tipos y formato
```

## Instalación

Requisitos: Node.js 20 o superior y PostgreSQL 14 o superior.

1. Cree una base de datos vacía llamada `tickets`.
2. Backend:
   ```
   cd backend
   npm install
   ```
   Cree `backend/.env` con las variables de la tabla siguiente y ejecute:
   ```
   npm run seed
   npm run dev
   ```
3. Frontend:
   ```
   cd frontend
   npm install
   npm run dev
   ```
4. Abra `http://localhost:3000`.

## Variables de entorno (`backend/.env`)

| Variable | Descripción | Predeterminado |
|---|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL | local |
| `JWT_SECRET` | Llave de sesión (use un valor largo y aleatorio) | de desarrollo |
| `FRONTEND_URL` / `APP_URL` | Dirección pública del frontend | `http://localhost:3000` |
| `STORAGE_DIR` | Carpeta privada de evidencias | `storage` |
| `MAX_UPLOAD_MB` | Tamaño máximo de archivo | 100 |
| `TICKET_COOLDOWN_SEG` / `TICKETS_POR_HORA` | Límite de envío de reportes | 30 / 10 |
| `CAPACIDAD_BALANCEADO` / `CAPACIDAD_SATURADO` | Puntos para etiquetar la capacidad de un técnico | 6 / 12 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Correo saliente. Sin `SMTP_HOST` solo funcionan las notificaciones internas | vacío |

## Cuentas de demostración

Contraseña de todas: `Demo1234!`. Elimine estas cuentas antes de usar datos reales.

| Rol | Correo |
|---|---|
| Reportante | reportante@demo.mx |
| Técnico (Norte) | tecnico.norte@demo.mx, tecnico.norte2@demo.mx |
| Técnico (Sur) | tecnico.sur@demo.mx |
| Coordinación (manager) | manager@demo.mx |
| Administración | admin@demo.mx |

## Reglas principales implementadas

- Estados: Nuevo, Asignado, En proceso, Listo para cerrar, Cerrado, Reabierto, Cancelado, con matriz de transiciones validada en servidor.
- Asignación automática por región al técnico con menos tickets abiertos; reasignación manual por la coordinación.
- Candado de cierre: requiere trabajo realizado, cómo se dejó, troubleshooting, tiempo registrado y evidencia de cierre. Se valida en servidor y en pantalla.
- Evidencias: tipo validado por contenido real, nombre aleatorio, almacenamiento privado, sin eliminación (solo reemplazo registrado).
- Bitácora de auditoría inmutable (la base de datos rechaza modificaciones y borrados).
- Reapertura por el reportante dentro de 48 horas; la coordinación puede reabrir en cualquier momento.
- Notificaciones internas y por correo: creación, asignación, solicitud de información, cambio de prioridad, cierre, reapertura y cancelación.
- Reportes con filtros y exportación a CSV y PDF: historial de cerrados, carga por técnico, actividades por categoría o sede, reaperturas y cumplimiento de fechas objetivo.

## Respaldo y restauración

Respaldo (base de datos y evidencias), desde PowerShell en `backend`:
```
.\scripts\respaldo.ps1
```
Restauración de la base:
```
pg_restore --clean --if-exists --no-owner --dbname="<DATABASE_URL>" respaldos\<fecha>\base.dump
```
Copie después las carpetas `evidencias` y `miniaturas` del respaldo a `backend/storage`.

## Cambio de servidor

El sistema no depende de un proveedor. Para mudarlo: restaure el respaldo en el nuevo PostgreSQL, copie la carpeta
de evidencias y ajuste las variables de entorno (`DATABASE_URL`, `STORAGE_DIR`, `FRONTEND_URL`, `APP_URL`).

## Antes de producción

- Servir bajo HTTPS y definir `NODE_ENV=production` (activa cookie segura).
- Cambiar `JWT_SECRET` y eliminar las cuentas de demostración.
- Pendiente: protección CSRF, límite de intentos de inicio de sesión y pruebas automatizadas.