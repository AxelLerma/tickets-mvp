# Sistema interno de soporte y atención de tickets

Plataforma web interna para el Instituto Electoral del Estado de Querétaro (IEEQ). Permite registrar incidencias, atenderlas con evidencia técnica obligatoria al cierre, supervisar la carga de trabajo en tiempo real y exportar reportes de antecedentes.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Backend | Node.js, Express 5, TypeScript, Zod |
| Base de datos | PostgreSQL (triggers de inmutabilidad y control de concurrencia) |
| Archivos | Almacenamiento local privado (`backend/storage`) con procesamiento `sharp` |
| Sesión | JWT en cookies `HttpOnly`, contraseñas con bcrypt |
| Notificaciones | Notificaciones internas en plataforma y cola de salida SMTP (Nodemailer) |
| Reportes | Exportación a CSV (UTF-8 con BOM) y PDF vectorial (`pdfkit`) |

## Estructura del proyecto

tickets-mvp/
├── backend/
│   ├── src/
│   │   ├── core/         Estados, validaciones de negocio y matriz de transiciones
│   │   ├── db/           Conexión, esquema SQL (DDL) y script de seed
│   │   ├── middleware/   Autenticación y control de acceso basado en roles (RBAC)
│   │   ├── routes/       Endpoints de la API REST
│   │   └── services/     Lógica operativa, reportes, evidencias y notificaciones
│   └── scripts/          Scripts de respaldo automatizado
└── frontend/
└── src/
├── app/          Rutas y vistas organizadas por rol (Next.js App Router)
├── components/   Componentes modulares (cronómetro, evidencias, panel técnico)
└── lib/          Consumo de API, formateadores y tipados TypeScript

## Instalación y puesta en marcha

### Requisitos previos
* Node.js 20 o superior
* PostgreSQL 14 o superior instalado y corriendo

---

### 1. Base de datos y Backend

1. Cree una base de datos vacía en PostgreSQL llamada `tickets`.
2. Diríjase a la carpeta del backend e instale dependencias:
   ```bash
   cd backend
   npm install

## Elaborado por Axel Yahir Lerma Aguilar