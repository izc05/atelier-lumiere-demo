# Aplicación real de Atelier Lumière

`source/` contiene la web, API, PostgreSQL, paneles privados, almacenamiento y herramientas operativas de Atelier Lumière. Permanece separada de la demo de GitHub Pages.

## Componentes

### Identidad y administración

- Talleres creados únicamente por Administración.
- Invitaciones, verificación de correo, contraseña, TOTP y códigos de recuperación.
- Sesiones de proveedor, cliente y administración en cookies `HttpOnly`.
- Roles administrativos `PLATFORM_OWNER`, `PROVIDER_MANAGER` y `EDITORIAL_REVIEWER`.
- Alta, suspensión, recuperación, cambio de rol y cierre remoto de sesiones.
- Confirmación reforzada para operaciones críticas.
- Servicios internos `AUTH_SERVICE`, `PILOT_CHECKOUT_SERVICE`, `PAYMENT_SERVICE`, `LEGAL_SERVICE` y `NOTIFICATION_SERVICE`, cada uno con políticas RLS específicas.

### Contenido y compra

- Catálogo con revisión editorial, stock, personalización, fotografías y vídeo.
- Blog, historias y escaparate público de cada taller.
- Un taller por checkout y un gasto de envío por pedido.
- Pedidos, encargos, presupuestos, mensajes, archivos, envíos e incidencias.
- Acceso privado del cliente y resumen imprimible.
- Pago sandbox firmado e idempotente que nunca mueve dinero.
- Avisos automáticos mediante cola PostgreSQL y reintentos.

### Seguridad y operación

- PostgreSQL 17 con RLS forzada.
- Migraciones incrementales con SHA-256 y bloqueo simultáneo.
- API enlazada a loopback en el host; web configurable para loopback detrás de Cloudflare.
- Contenedores ejecutados sin privilegios y logs Docker rotados.
- Copia completa de PostgreSQL y multimedia con manifiesto y SHA-256.
- Verificación mediante restauración temporal de PostgreSQL y validación del archivo multimedia.
- Copia externa opcional y retención automática.
- Healthchecks de web, API y base, además de comprobación de espacio y antigüedad de copias.

## Desarrollo local

```bash
npm install
npm test
npm run dev:api
```

En otra terminal:

```bash
npm run dev:web
```

## Mini PC

### Instalación

```bash
npm run init:mini-pc -- --app-url http://IP_DEL_MINI_PC:3000
npm run preflight:mini-pc -- --mode install
npm run deploy:mini-pc -- install
```

Crear después el primer propietario con la persona responsable presente:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml \
  exec -it api npm run bootstrap:platform-owner
```

### Correo y operación

```bash
npm run configure:smtp
npm run backup:pilot -- /opt/atelier-backups
npm run health:mini-pc
sudo npm run install:pilot-operations
```

### Actualización

```bash
npm run preflight:mini-pc -- --mode update
npm run deploy:mini-pc -- update
```

El modo `update` crea primero una copia completa verificada, después actualiza `main`, migra y comprueba los servicios. Nunca borra volúmenes ni restaura automáticamente.

## Modo piloto

Todas las funciones sensibles permanecen apagadas de forma predeterminada. Tras configurar HTTPS, SMTP y copias externas se pueden activar:

```dotenv
PILOT_MODE_ENABLED=true
PILOT_CHECKOUT_ENABLED=true
PAYMENT_SANDBOX_ENABLED=true
ORDER_EMAIL_NOTIFICATIONS_ENABLED=true
```

El preflight bloquea configuraciones incoherentes, como checkout en producción sin SMTP o sandbox activo fuera del modo piloto.

## Pruebas

```bash
npm test
```

GitHub Actions valida aplicación, demo, PostgreSQL, aislamiento, servicios internos, migraciones, copia y restauración, Docker y asistente del mini PC.

## Documentación

- [`docs/MINI_PC_INSTALL.md`](docs/MINI_PC_INSTALL.md)
- [`docs/MINI_PC_OPERATOR.md`](docs/MINI_PC_OPERATOR.md)
- [`docs/PILOT_RUNBOOK.md`](docs/PILOT_RUNBOOK.md)
- [`docs/PAYMENT_SANDBOX.md`](docs/PAYMENT_SANDBOX.md)
- [`legal/README.md`](legal/README.md)

## Reglas permanentes

- No editar migraciones ya aplicadas.
- No subir `.env`, copias, datos personales o multimedia real.
- No usar `docker compose down -v`.
- No activar cobros reales sin modelo contractual, revisión jurídica y pasarela oficial.
- Toda funcionalidad nueva debe incluir pruebas antes de fusionarse.
