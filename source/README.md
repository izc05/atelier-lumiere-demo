# Aplicación real de Atelier Lumière

Esta carpeta contiene el código mantenible de la aplicación real. Permanece separada de la exportación pública de GitHub Pages para desarrollar, probar y desplegar sin romper la demo visual.

## Estructura

```text
source/
├── apps/
│   ├── web/       # Web pública, paneles privados y proxies BFF
│   └── api/       # API, autenticación y servicios de dominio
├── packages/
│   ├── database/  # Migraciones, RLS, pruebas SQL y mapa de datos
│   ├── auth/      # Políticas de invitación, roles y doble factor
│   ├── storage/   # Límites y reglas de multimedia
│   └── shared/    # Estados y permisos compartidos
├── infra/
│   └── docker/    # Web, API, PostgreSQL y volúmenes persistentes
├── legal/         # Alcance y límites de los borradores legales
├── scripts/       # Validaciones estáticas y de seguridad
├── tests/         # Contratos de dominio
└── .env.example
```

## Componentes implementados

### Identidad y talleres

- Proveedores creados únicamente por Administración.
- Invitaciones de un solo uso.
- Verificación de correo.
- Contraseñas derivadas con `scrypt`.
- Doble factor TOTP y códigos de recuperación.
- Recuperación de contraseña y de 2FA.
- Sesiones privadas en cookies `HttpOnly`.
- Aislamiento por taller mediante RLS forzada.
- Auditoría de operaciones sensibles.

### Administración

- Cuentas administrativas persistentes separadas de los talleres.
- Roles `PLATFORM_OWNER`, `PROVIDER_MANAGER` y `EDITORIAL_REVIEWER`.
- Acceso mediante correo, contraseña y TOTP o código de recuperación.
- Sesiones revocables guardadas en cookie `HttpOnly`.
- BFF administrativo único: el navegador nunca recibe el token interno.
- Creador local e interactivo de la primera cuenta `PLATFORM_OWNER`.
- Bloqueo automático del bootstrap cuando ya existe un propietario.

### Catálogo y multimedia

- Borradores, revisión, solicitud de cambios, aprobación y publicación.
- Precio, stock, preparación, historia y personalizaciones.
- Hasta ocho imágenes y un vídeo por artículo.
- Almacenamiento privado fuera de PostgreSQL.
- Validación binaria del contenido.
- Previews WebP sin metadatos.
- Catálogo público limitado a talleres activos y artículos publicados.

### Blog editorial

- Editor privado del taller.
- Portada y galería.
- Productos relacionados.
- Revisión administrativa.
- Publicación pública de historias aprobadas.

### Pedidos y encargos

- Compra piloto dividida en pedidos independientes por taller.
- Precios recalculados en servidor.
- Reserva transaccional de stock.
- Acceso privado del cliente mediante enlace de un solo uso.
- Conversación y archivos privados.
- Presupuesto versionado y aprobación exclusiva del cliente.
- Seguimiento, incidencias y cronología.
- Idempotencia frente a envíos repetidos.

### Legal y privacidad

- Ocho tipos de documento legal versionado.
- SHA-256 e inmutabilidad de documentos activos y retirados.
- Revisión profesional obligatoria antes de activar textos.
- Borradores ocultos en producción.
- Centro de privacidad con categorías opcionales desactivadas.
- Cookie técnica `HttpOnly` para la clave anónima de preferencias.
- Solo se guarda el hash de esa clave.
- Historial de decisiones append-only.

## Ejecutar sin Docker

Requiere Node.js 22 o posterior.

```bash
cd source
npm install
npm test
npm run dev:api
```

En otra terminal:

```bash
cd source
npm run dev:web
```

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Salud: `http://localhost:4000/health`
- Metadatos técnicos: `http://localhost:4000/api/meta`

Sin `DATABASE_URL`, la aplicación puede mostrar el estado técnico, pero las funciones persistentes quedan desactivadas.

## Ejecutar con Docker

```bash
cd source
cp .env.example .env
# Cambiar todas las contraseñas, claves y secretos.
docker compose -f infra/docker/docker-compose.yml up --build
```

Docker Compose levanta:

- web en el puerto configurado;
- API expuesta solo en `127.0.0.1`;
- PostgreSQL 17;
- volumen persistente de base de datos;
- volumen privado de multimedia.

Las migraciones montadas en `/docker-entrypoint-initdb.d` se aplican únicamente al crear una base vacía. Antes del piloto real sobre una base existente debe añadirse un ejecutor de migraciones versionado.

### Instalación en el mini PC

La guía completa está en [`docs/MINI_PC_INSTALL.md`](docs/MINI_PC_INSTALL.md). No hay que copiar archivos manualmente: el mini PC clona o actualiza el repositorio con Git y ejecuta la aplicación con Docker.

En una base nueva, la primera cuenta propietaria se crea mediante:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml \
  exec -it api npm run bootstrap:platform-owner
```

La contraseña se introduce de forma oculta y el QR/códigos de recuperación solo se muestran durante esa ejecución interactiva.

## Pruebas

```bash
cd source
npm test
```

La batería comprueba, entre otros puntos:

- contratos y permisos;
- autenticación y doble factor;
- bootstrap seguro del primer propietario;
- correo y recuperación;
- catálogo y blog;
- archivos privados;
- pedidos, checkout, seguimiento e incidencias;
- centro legal y privacidad;
- ausencia de secretos en el navegador;
- estructura compatible con la CSP.

GitHub Actions añade pruebas reales sobre PostgreSQL aplicando todas las migraciones y verificando el aislamiento entre talleres.

## Configuración pendiente de producción

- Recuperación específica de cuentas administrativas.
- Permisos efectivos y mínimos por cada rol administrativo.
- Modelo comercial, vendedor contractual, comisiones y facturación.
- Decisión final del modelo de carrito antes de integrar pagos.
- Pasarela de pago en sandbox y webhooks firmados.
- Ejecutor de migraciones incrementales.
- Copias automáticas y prueba de restauración.
- SMTP real.
- HTTPS, cookies `Secure` y Cloudflare Tunnel.
- Revisión jurídica profesional.
- Adaptación visual definitiva de la aplicación fuente.

## Reglas permanentes

- Un proveedor nunca puede consultar ni modificar otro taller.
- Administración controla altas, revisiones y publicaciones.
- El navegador nunca recibe tokens internos de API.
- Los datos personales no se guardan en `localStorage`.
- Las imágenes, vídeos y documentos reales no se almacenan en GitHub.
- Toda funcionalidad nueva debe incluir pruebas antes de fusionarse.
- La demo pública no será sustituida hasta que la aplicación real iguale su calidad visual y supere el piloto.
