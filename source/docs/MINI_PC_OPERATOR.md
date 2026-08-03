# Asistente operativo del mini PC

Este documento reduce la instalación y las actualizaciones de Atelier Lumière a comandos controlados. Está pensado para que Codex pueda ejecutar el trabajo técnico sin copiar archivos manualmente y sin improvisar operaciones destructivas.

## Responsabilidades

### Codex puede ejecutar

- comprobación previa del mini PC;
- revisión de `.env` sin mostrar sus valores;
- construcción de imágenes Docker;
- creación y verificación de copias;
- actualización `fast-forward` de la rama `main`;
- migraciones incrementales;
- arranque y comprobación de PostgreSQL, API y web;
- lectura de logs y diagnóstico de errores.

### Requiere a la persona responsable

- escribir la contraseña del primer `PLATFORM_OWNER`;
- escanear el QR TOTP;
- guardar los códigos de recuperación;
- autorizar una restauración real;
- decidir cuándo activar HTTPS y publicar el servicio.

Nunca se debe copiar al chat el contenido completo de `.env`, una contraseña, el secreto TOTP o los códigos de recuperación.

## 1. Comprobación previa

Desde `/opt/atelier-lumiere/source`:

```bash
npm run preflight:mini-pc -- --mode check
```

Para una instalación nueva:

```bash
npm run preflight:mini-pc -- --mode install
```

Para una actualización:

```bash
npm run preflight:mini-pc -- --mode update
```

El preflight no modifica Git, Docker ni PostgreSQL. Revisa:

- Linux y arquitectura;
- Git, Docker, Docker Compose, OpenSSL y curl;
- acceso al daemon de Docker;
- memoria y espacio libre;
- rama `main` y ausencia de cambios locales;
- existencia y permisos privados de `.env`;
- secretos mínimos de producción;
- clave TOTP Base64 de exactamente 32 bytes;
- `NODE_ENV=production`;
- `ALLOW_DEV_ADMIN_AUTH=false`;
- sintaxis efectiva de Docker Compose;
- puertos y carpeta privada de copias.

Un error bloquea el despliegue. Un aviso permite continuar, pero debe revisarse.

## 2. Simular el despliegue

Antes de ejecutar cambios se puede mostrar la secuencia prevista:

```bash
npm run deploy:mini-pc -- install --dry-run
```

O para una actualización:

```bash
npm run deploy:mini-pc -- update --dry-run
```

La simulación no modifica Git, Docker ni PostgreSQL.

## 3. Instalar por primera vez

Después de configurar `.env` y superar el preflight:

```bash
npm run deploy:mini-pc -- install
```

El asistente:

1. valida el mini PC;
2. construye las imágenes;
3. arranca PostgreSQL;
4. aplica todas las migraciones;
5. arranca API y web;
6. comprueba la salud de los servicios;
7. registra el commit desplegado.

Después se crea presencialmente la cuenta propietaria:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml \
  exec -it api npm run bootstrap:platform-owner
```

Tras crearla, se cambia `ENABLE_ADMIN_UI=true` en `.env` y se ejecuta de nuevo:

```bash
npm run deploy:mini-pc -- install
```

## 4. Actualizar una instalación existente

```bash
npm run deploy:mini-pc -- update
```

El orden está fijado:

1. preflight;
2. copia PostgreSQL privada;
3. restauración temporal para verificar la copia;
4. `git fetch` de `origin/main`;
5. actualización únicamente `fast-forward`;
6. construcción de imágenes;
7. migraciones incrementales;
8. arranque;
9. comprobación de salud;
10. registro del despliegue.

La copia se crea **antes** de descargar código nuevo. Si una migración o un servicio falla, el asistente muestra:

- etapa exacta;
- commit anterior;
- commit descargado;
- ruta de la copia verificada;
- comandos de diagnóstico.

No ejecuta `git reset --hard`, no borra volúmenes y no restaura automáticamente una base.

## 5. Registros de despliegue

Los despliegues correctos generan un archivo privado en:

```text
/opt/atelier-backups/deployments/
```

Contiene:

- modo `install` o `update`;
- fecha UTC;
- commit anterior;
- commit desplegado;
- copia utilizada;
- estado final saludable.

No contiene contraseñas ni secretos.

## 6. Cuando algo falla

No ejecutar `docker compose down -v` ni borrar `database_data`.

Revisar:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml ps -a

docker compose --env-file .env -f infra/docker/docker-compose.yml \
  logs --tail=200 migrate api web database
```

Comprobar la copia indicada por el asistente:

```bash
npm run verify:backup -- /opt/atelier-backups/atelier-FECHA.dump
```

Una restauración real solo se realiza después de revisar la fecha, el commit y el contenido esperado:

```bash
npm run restore:database -- \
  /opt/atelier-backups/atelier-FECHA.dump \
  RESTORE_ACTIVE_DATABASE
```

## 7. Comando recomendado para Codex

Cuando el repositorio ya esté clonado en el mini PC, la instrucción segura para Codex es:

```text
Abre /opt/atelier-lumiere, revisa source/docs/MINI_PC_OPERATOR.md, ejecuta primero el preflight correspondiente y no continúes si aparece un error. No muestres ni modifiques secretos sin mi autorización. No borres volúmenes ni restaures la base activa.
```
