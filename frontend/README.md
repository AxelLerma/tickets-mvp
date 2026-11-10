# Sistema Interno de Soporte y Atención de Tickets — IEEQ

Plataforma web progresiva (PWA) de nivel empresarial desarrollada para el **Instituto Electoral del Estado de Querétaro (IEEQ)**. Diseñada para centralizar la gestión de solicitudes operativas, asegurar la atención técnica con evidencia obligatoria al cierre, monitorear la carga de trabajo en tiempo real y emitir reportes de antecedentes auditables.

---

## Características Principales

* **Control de Acceso Basado en Roles (RBAC):**
  * **Reportante:** Formulario asistido en lenguaje no técnico, carga de evidencia inicial (imágenes, video, PDF), seguimiento en vivo y ventana de reapertura de 48 horas.
  * **Técnico:** Cola de trabajo priorizada con cálculo de SLA, temporizador automático por paso de troubleshooting, registro de tiempos y validación electrónica de 5 controles obligatorios antes del cierre.
  * **Coordinación (Manager):** Panel operativo en tiempo real, cálculo de capacidad por técnico (*Disponible*, *Balanceado*, *Saturado*), balanceo y reasignación masiva de tickets en un clic, detección de incidencias repetidas y generador reactivo de reportes.
  * **Administración:** Gestión de usuarios con contraseñas cifradas y sesiones revocables, administración de catálogos dinámicos (sedes, regiones, categorías, subcategorías, grupos técnicos y motivos) sin modificar código.
* **Trazabilidad e Inmutabilidad:** Triggers a nivel de base de datos en PostgreSQL que impiden la alteración o eliminación de bitácoras de auditoría, troubleshooting y evidencias técnicas.
* **Soporte PWA Móvil:** Interfaz responsiva instalable en Android e iOS, visor de imágenes integrado (lightbox) y soporte de archivos multimedia pesados (videos de hasta 100 MB).
* **Reportes y Exportación:** Filtrado dinámico con auto-fetch sin recargas de página y exportación nativa a PDF vectorial y CSV (UTF-8 con BOM).

---

## Tecnologías Utilizadas

| Capa | Tecnología | Justificación y Uso |
| :--- | :--- | :--- |
| **Frontend** | Next.js 16 (App Router, Turbopack) | Renderizado híbrido, enrutamiento modular y compilación ultrarrápida. |
| **Librería UI** | React 19 & Tailwind CSS v4 | Componentes declarativos, diseño responsivo y Modo Oscuro nativo. |
| **Backend** | Node.js & Express 5 | API REST desacoplada, concurrencia eficiente y arquitectura de servicios. |
| **Lenguaje** | TypeScript | Tipado estricto de extremo a extremo, prevención de errores en compilación y contratos de datos robustos. |
| **Base de Datos** | PostgreSQL 15 | Integridad relacional, transacciones ACID, tipos JSONB y triggers de inmutabilidad en PL/pgSQL. |
| **Validación** | Zod | Validación estricta de esquemas y sanitización de entradas contra inyecciones. |
| **Seguridad** | JWT & Bcrypt | Sesiones seguras en cookies `HttpOnly` y hashing robusto de contraseñas. |
| **Almacenamiento** | Privado local & Sharp | Procesamiento de miniaturas para imágenes y almacenamiento aislado de evidencias. |
| **Notificaciones** | In-App & Nodemailer (SMTP) | Alertas visuales adaptativas y cola de salida de correos transaccionales con reintentos automáticos. |
| **Infraestructura** | Docker Compose & Cloudflare Tunnels | Despliegue en contenedores aislados y acceso remoto seguro sin apertura de puertos. |

---

## Estructura del Repositorio

```text
tickets-mvp/
├── docker-compose.yml              # Orquestación de contenedores (db, backend, frontend)
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── scripts/
│   │   └── respaldo.ps1            # Script de respaldo automatizado de base y evidencias
│   └── src/
│       ├── app.ts                  # Servidor Express, middlewares y rutas
│       ├── config.ts               # Variables de entorno centralizadas
│       ├── server.ts               # Punto de entrada del backend
│       ├── core/                   # Estados, validaciones y reglas de negocio
│       ├── db/                     # Conexión, seed y esquemas DDL (PostgreSQL)
│       ├── middleware/             # Autenticación JWT y control de acceso (RBAC)
│       ├── routes/                 # Controladores y endpoints REST
│       └── services/               # Lógica de atención, reportes, auditoría y correo
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── next.config.ts              # Configuración de proxy y tamaño máximo de subida
    ├── public/
    │   └── manifest.json           # Manifiesto para Progressive Web App (PWA)
    └── src/
        ├── app/                    # Vistas estructuradas por rol (App Router)
        ├── components/             # Componentes modulares (Panel técnico, cronómetro, visor)
        └── lib/                    # Cliente HTTP, utilidades de formato y roles
```

---

## Despliegue Rápido con Docker Compose

La forma recomendada de levantar el entorno completo (base de datos, backend y frontend) sin configurar dependencias locales:

1. **Clonar el repositorio:**
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd tickets-mvp
   ```

2. **Iniciar los servicios:**
   ```bash
   docker compose up -d --build
   ```

3. **Poblar la base de datos con usuarios y catálogos demo:**
   ```bash
   docker compose exec backend npm run seed
   ```

4. **Acceder a la aplicación:**
   * **Frontend:** `http://localhost:3000`
   * **API Backend:** `http://localhost:4000/api/health`

---

## Instalación y Ejecución Manual (Desarrollo Local)

### Requisitos Previos
* **Node.js:** Versión 20 o superior.
* **PostgreSQL:** Versión 14 o superior instalado y ejecutándose.

---

### 1. Base de Datos
Crea una base de datos vacía en tu servidor PostgreSQL llamada `tickets`:
```sql
CREATE DATABASE tickets;
```

---

### 2. Configuración del Backend

1. Entra a la carpeta `backend` e instala las dependencias:
   ```bash
   cd backend
   npm install
   ```

2. Crea el archivo `.env` en la raíz de `backend/` con las siguientes variables:
   ```env
   PORT=4000
   JWT_SECRET=tu-clave-secreta-de-produccion
   FRONTEND_URL=http://localhost:3000
   DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/tickets
   STORAGE_DIR=storage
   MAX_UPLOAD_MB=100
   TICKET_COOLDOWN_SEG=10
   TICKETS_POR_HORA=10
   CAPACIDAD_BALANCEADO=4
   CAPACIDAD_SATURADO=8
   NODE_ENV=development
   ```

3. Inicializa las tablas y carga los datos de prueba:
   ```bash
   npm run seed
   ```

4. Inicia el backend en modo desarrollo:
   ```bash
   npm run dev
   ```
   *El servidor quedará listo en `http://localhost:4000`.*

---

### 3. Configuración del Frontend

1. Abre una nueva terminal, entra a la carpeta `frontend/` e instala las dependencias:
   ```bash
   cd frontend
   npm install
   ```

2. Inicia el servidor de desarrollo de Next.js:
   ```bash
   npm run dev
   ```
   *El portal web estará disponible en `http://localhost:3000`.*

---

## Credenciales de Demostración

La base de datos incluye cuentas preconfiguradas para validar cada rol del sistema.  
**Contraseña unificada para todos los usuarios demo:** `Demo1234!`

| Rol | Correo Electrónico | Alcance de Prueba |
| :--- | :--- | :--- |
| **Reportante** | `reportante@demo.mx` | Registro de incidencias, seguimiento y reapertura. |
| **Técnico (Norte)** | `tecnico.norte@demo.mx` | Atención técnica, troubleshooting y controles de cierre con evidencia. |
| **Técnico (Norte 2)** | `tecnico.norte2@demo.mx` | Consulta de cola compartida de grupo y atención individual. |
| **Técnico (Sur)** | `tecnico.sur@demo.mx` | Atención de tickets asignados en la región Sur. |
| **Coordinación (Manager)** | `manager@demo.mx` | Dashboard operativo, reasignación por carga y reportes. |
| **Administración** | `admin@demo.mx` | Control de usuarios, restablecimiento de contraseñas y catálogos. |

---

## Acceso Remoto Seguro (Cloudflare Tunnels)

Para permitir que supervisores o colaboradores externos accedan a la aplicación desde cualquier red sin abrir puertos en el módem (NAT/Port Forwarding):

1. Descarga el ejecutable oficial `cloudflared` para Windows y colócalo en la raíz del proyecto.
2. Con los servidores de frontend y backend corriendo, ejecuta en PowerShell:
   ```powershell
   .\cloudflared tunnel --url http://localhost:3000 --http-host-header "localhost:3000"
   ```
3. Copia la URL pública generada (ej. `https://xxxx-xxxx.trycloudflare.com`) y compártela. Cuenta con certificado SSL automático y canal cifrado punto a punto.

---

## Instalación Móvil (PWA)

* **Android (Google Chrome):** Abre el enlace generado y pulsa sobre el banner inferior **"Instalar aplicación"** (o menú de 3 puntos → *Instalar aplicación*).
* **iOS (Safari):** Abre el enlace en Safari, pulsa el botón **Compartir** y selecciona **"Agregar a inicio"**.

---

## Respaldo de Información

El proyecto cuenta con un script de respaldo automatizado en PowerShell ubicado en `backend/scripts/respaldo.ps1`. Realiza un volcado binario de la base de datos (`pg_dump`) y una copia íntegra del directorio de evidencias y miniaturas:

```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\respaldo.ps1
```

*Los respaldos se almacenan organizados por marca de tiempo y purgan automáticamente copias con más de 30 días de antigüedad.*

---

## Autoría

Proyecto diseñado e implementado por **Axel Yahir Lerma Aguilar**.