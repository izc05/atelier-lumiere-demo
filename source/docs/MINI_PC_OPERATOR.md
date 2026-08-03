# Asistente operativo del mini PC

Este documento reduce la instalación y las actualizaciones de Atelier Lumière a comandos controlados. Está pensado para que Codex pueda ejecutar el trabajo técnico sin copiar archivos manualmente y sin improvisar operaciones destructivas.

## Responsabilidades

### Codex puede ejecutar

- generación inicial del archivo `.env` sin mostrar secretos;
- comprobación previa del mini PC;
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

## 1. Generar la configuración privada

En una instalación nueva, desde `/opt/atelier-lumiere/source`:

```bash
npm run init:mini-pc -- --app-url http://IP_DEL_MINI_PC:3000
```

Para una publicación que ya vaya a funcionar exclusivamente mediante HTTPS:

```bash
npm run init:mini-pc -- --app-url https://atelier.example.com
```

El generador:

- crea `.env` con permisos `600`;
- genera contraseñas y peppers aleatorios;
- genera una clave TOTP Base64 de 32 bytes;
- configura `NODE_ENV=production`;
- desactiva el acceso administrativo temporal;
- desactiva SMTP y checkout piloto;
- activa cookies `Secure` únicamente cuando la URL comienza por `https://`;
- no imprime los secretos;
- se niega a sobrescribir un `.env` existente.

Opciones adicionales:

```bash
npm run init:mini-pc -- \
  --app-url http://IP_DEL_MINI_PC:3000 \
  --web-port 3000 \
  --api-port 4000
```

## 2. Comprobación previa

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

## 3. Simular el despliegue

Antes de ejecutar cambios se puede mostrar la secuencia prevista:

```bash
npm run deploy:mini-pc -- install --dry-run
```

O para una actualización:

```bash
npm run deploy:mini-pc -- update --dry-run
```

La simulación no modifica Git, Docker ni PostgreSQL.

## 4. Instalar por primera vez

Después de generar `.env` y superar el preflight:

```bash
npm run deploy:mini-pc -- install
```

El asistente:

1. valida el mini PC;
2. construye las imágenes;
3. arranca PostgreSQL;
4. comprueba que la base esté realmente vacía;
5. aplica todas las migraciones;
6. arranca API y web;
7. comprueba la salud de los servicios;
8. registra el commit desplegado.

Si la base ya contiene tablas, `install` se detiene y exige usar `update`, porque solo ese modo crea y verifica una copia previa.

## 5. Crear y activar el primer administrador

Este paso se realiza contigo presente:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml \
  exec -it api npm run bootstrap:platform-owner
```

Después de guardar los códigos de recuperación, editar `.env`:

```dotenv
ENABLE_ADMIN_UI=true
```

Recrear únicamente la API y la web:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml \
  up -d --build api web
```

No se vuelve a ejecutar el modo `install`, porque PostgreSQL ya contiene la aplicación.

## 6. Actualizar una instalación existente

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

## 7. Registros de despliegue

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

## 8. Cuando algo falla

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

## 9. Comando recomendado para Codex

Cuando el repositorio ya esté clonado en el mini PC, la instrucción segura para Codex es:

```text
Abre /opt/atelier-lumiere, revisa source/docs/MINI_PC_OPERATOR.md, ejecuta primero el preflight correspondiente y no continúes si aparece un error. No muestres ni modifiques secretos sin mi autorización. No borres volúmenes ni restaures la base activa.
```
