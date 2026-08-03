# Instalación piloto en mini PC

Esta guía prepara una instalación nueva de Atelier Lumière mediante Docker. No se copian archivos manualmente: el mini PC descarga y actualiza el proyecto con Git.

> Si ya existe un volumen PostgreSQL creado con una versión anterior y contiene tablas pero no historial `schema_migrations`, el sistema se detendrá sin modificarlo. Debe hacerse una copia y utilizar el procedimiento de adopción de base existente antes de continuar.

## 1. Requisitos

- Ubuntu o Debian actualizado.
- Git.
- Docker Engine y el complemento `docker compose`.
- Acceso al repositorio.
- Un móvil con aplicación TOTP: Google Authenticator, Microsoft Authenticator, 2FAS o equivalente.

## 2. Descargar el proyecto

```bash
cd /opt
sudo git clone https://github.com/izc05/atelier-lumiere-demo.git atelier-lumiere
sudo chown -R "$USER":"$USER" /opt/atelier-lumiere
cd /opt/atelier-lumiere/source
```

## 3. Crear el archivo privado de configuración

```bash
cp .env.example .env
chmod 600 .env
```

Editar `.env` y sustituir todos los valores `GENERAR_...`. Estos comandos generan los secretos principales:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

Configuración mínima recomendada para el piloto:

```dotenv
NODE_ENV=production
POSTGRES_PASSWORD=CAMBIAR_POR_UNA_CLAVE_LARGA
AUTH_LOGIN_PEPPER=SECRETO_ALEATORIO_DE_64_CARACTERES
TWO_FACTOR_ENCRYPTION_KEY_BASE64=RESULTADO_DE_OPENSSL_RAND_BASE64_32
TWO_FACTOR_RECOVERY_PEPPER=OTRO_SECRETO_ALEATORIO_DE_64_CARACTERES
ALLOW_DEV_ADMIN_AUTH=false
ENABLE_ADMIN_UI=false
WEB_COOKIE_SECURE=false
PROVIDER_COOKIE_SECURE=false
MIGRATION_STATEMENT_TIMEOUT_MS=120000
MIGRATION_LOCK_TIMEOUT_MS=10000
```

Mientras el acceso sea solo local por HTTP, las cookies `Secure` permanecen en `false`. Cuando se publique exclusivamente por HTTPS mediante Cloudflare Tunnel, deben cambiarse a `true`.

No se debe enviar el archivo `.env` por correo, WhatsApp ni subirlo a GitHub.

## 4. Construir y arrancar los servicios

Desde `/opt/atelier-lumiere/source`:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --build
```

El orden es automático:

1. PostgreSQL queda saludable.
2. `migrate` verifica el historial y aplica solo los SQL pendientes.
3. La API arranca únicamente si las migraciones terminan correctamente.
4. La web espera a que la API esté saludable.

Comprobar el estado y el resultado de migraciones:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml ps -a
docker compose --env-file .env -f infra/docker/docker-compose.yml logs --tail=100 migrate
docker compose --env-file .env -f infra/docker/docker-compose.yml logs --tail=100 api
```

El servicio `migrate` debe aparecer como terminado con código `0`. Es normal que no permanezca en ejecución.

## 5. Crear la primera cuenta PLATFORM_OWNER

Este paso requiere estar delante del terminal y tener el móvil preparado. La contraseña no se muestra ni se pasa como argumento.

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml \
  exec -it api npm run bootstrap:platform-owner
```

El asistente solicita:

1. Correo administrativo.
2. Nombre visible.
3. Contraseña y confirmación.
4. Escaneo del QR TOTP.
5. Código de seis cifras.

Solo después de validar el código se crea la cuenta. Al terminar se muestran diez códigos de recuperación una sola vez. Deben guardarse fuera del mini PC, preferiblemente impresos o dentro de un gestor de contraseñas.

El comando queda bloqueado automáticamente cuando ya existe cualquier cuenta `PLATFORM_OWNER`.

## 6. Activar la interfaz administrativa

Editar `.env`:

```dotenv
ENABLE_ADMIN_UI=true
```

Recrear web y API:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d --build
```

Acceso local inicial:

```text
http://IP_DEL_MINI_PC:3000/admin/proveedores/
```

## 7. Comprobación básica

```bash
curl -I http://127.0.0.1:3000/
curl http://127.0.0.1:4000/health
```

Comprobar desde el navegador:

- La portada abre.
- `/admin/proveedores/` solicita correo, contraseña y segundo factor.
- Un código TOTP ya utilizado no se acepta de nuevo.
- El cierre de sesión vuelve a la pantalla de acceso.

## 8. Copia antes de cada actualización

```bash
mkdir -p /opt/atelier-backups

docker compose --env-file .env -f infra/docker/docker-compose.yml exec -T database \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "/opt/atelier-backups/atelier-$(date +%Y%m%d-%H%M%S).sql"
```

Comprobar que el archivo no esté vacío:

```bash
ls -lh /opt/atelier-backups/
```

## 9. Actualizar el proyecto sin borrar datos

```bash
cd /opt/atelier-lumiere
git switch main
git pull --ff-only origin main
cd source

docker compose --env-file .env -f infra/docker/docker-compose.yml build

docker compose --env-file .env -f infra/docker/docker-compose.yml run --rm migrate

docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
```

El proceso `migrate`:

- mantiene una tabla `schema_migrations`;
- compara el SHA-256 de las migraciones aplicadas;
- rechaza cualquier archivo histórico modificado o eliminado;
- aplica solo los archivos nuevos;
- registra la migración dentro de la misma transacción;
- impide que dos actualizaciones se ejecuten al mismo tiempo.

Nunca se debe borrar `database_data` para “arreglar” un fallo de migración. Primero se revisan los logs y la copia de seguridad.

## Qué puede hacer Codex

Codex, abierto sobre el repositorio del mini PC, puede ejecutar prácticamente todos los comandos de esta guía: actualizar Git, crear la copia, construir Docker, ejecutar `migrate`, revisar logs y aplicar correcciones.

La creación inicial del `PLATFORM_OWNER` debe hacerse contigo presente, porque necesitas:

- escribir la contraseña privada;
- escanear el QR con el móvil;
- guardar los códigos de recuperación.

No debes compartir con Codex, GitHub ni el chat la contraseña, el secreto TOTP, los códigos de recuperación o el contenido completo de `.env`.
