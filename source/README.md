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
│   └── docker/    # Web, API, migraciones, PostgreSQL y volúmenes persistentes
├── legal/         # Alcance y límites de los borradores legales
├── scripts/       # Validaciones, operación y seguridad
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

### Base de datos y operación

- Migraciones SQL ordenadas y versionadas.
- Historial persistente en `schema_migrations`.
- SHA-256 de cada migración aplicada.
- Rechazo de archivos históricos modificados, eliminados o con huecos.
- Bloqueo PostgreSQL para impedir dos actualizaciones simultáneas.
- Registro de la migración dentro de la misma transacción que sus cambios.
- La API no arranca hasta que el servicio `migrate` termina correctamente.
- Una base antigua sin historial se bloquea y nunca se adopta por suposición.
- Copias privadas comprimidas con SHA-256 y metadatos.
- Verificación mediante restauración completa en una base temporal.
- Restauración real mediante intercambio y conservación de rollback.
- Asistente del mini PC para generar configuración, comprobar, instalar y actualizar.

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

Requiere Node.js 22 o posterior y una `DATABASE_URL` válida para migraciones y funciones persistentes.

```bash
cd source
npm install
npm test
npm run migrate
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

## Ejecutar con Docker en el mini PC

No hay que copiar archivos manualmente. El servidor clona o actualiza el repositorio mediante Git.

Guías:

- [`docs/MINI_PC_INSTALL.md`](docs/MINI_PC_INSTALL.md): instalación, migraciones, copias y restauración.
- [`docs/MINI_PC_OPERATOR.md`](docs/MINI_PC_OPERATOR.md): comandos seguros para Codex y operación cotidiana.

### Instalación resumida

```bash
cd /opt/atelier-lumiere/source
npm run init:mini-pc -- --app-url http://IP_DEL_MINI_PC:3000
npm run preflight:mini-pc -- --mode install
npm run deploy:mini-pc -- install
```

Después, con la persona responsable presente:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml \
  exec -it api npm run bootstrap:platform-owner
```

### Actualización resumida

```bash
cd /opt/atelier-lumiere/source
npm run preflight:mini-pc -- --mode update
npm run deploy:mini-pc -- update
```

El modo `update` crea y restaura temporalmente una copia antes de descargar código nuevo. No borra volúmenes ni restaura automáticamente la base activa.

## Pruebas

```bash
cd source
npm test
```

La batería comprueba, entre otros puntos:

- contratos y permisos;
- autenticación y doble factor;
- bootstrap seguro del primer propietario;
- descubrimiento, checksum, orden y bloqueo de migraciones;
- rechazo de una base antigua sin historial;
- copia, restauración temporal, intercambio y rollback;
- generación privada de `.env`, preflight y despliegue simulado;
- correo y recuperación;
- catálogo y blog;
- archivos privados;
- pedidos, checkout, seguimiento e incidencias;
- centro legal y privacidad;
- ausencia de secretos en el navegador;
- estructura compatible con la CSP.

GitHub Actions añade pruebas reales sobre PostgreSQL y Docker, incluido un ciclo completo de copia, modificación, restauración y arranque saludable.

## Configuración pendiente de producción

- Procedimiento revisado de adopción para bases antiguas sin `schema_migrations`.
- Recuperación específica de cuentas administrativas.
- Permisos efectivos y mínimos por cada rol administrativo.
- Modelo comercial, vendedor contractual, comisiones y facturación.
- Decisión final del modelo de carrito antes de integrar pagos.
- Pasarela de pago en sandbox y webhooks firmados.
- Programación automática y copia externa de backups.
- SMTP real.
- HTTPS, cookies `Secure` y Cloudflare Tunnel.
- Revisión jurídica profesional.
- Adaptación visual definitiva de la aplicación fuente.

## Reglas permanentes

- Un proveedor nunca puede consultar ni modificar otro taller.
- Administración controla altas, revisiones y publicaciones.
- El navegador nunca recibe tokens internos de API.
- Los datos personales no se guardan en `localStorage`.
- Las imágenes, vídeos, documentos y copias reales no se almacenan en GitHub.
- Las migraciones aplicadas nunca se editan; los cambios se añaden en un archivo nuevo.
- Un despliegue no borra volúmenes ni restaura automáticamente la base activa.
- Toda funcionalidad nueva debe incluir pruebas antes de fusionarse.
- La demo pública no será sustituida hasta que la aplicación real iguale su calidad visual y supere el piloto.
