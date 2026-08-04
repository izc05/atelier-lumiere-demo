# Instalación segura en el mini PC

La instalación oficial se realiza mediante los asistentes del repositorio. No se copia `.env.example` manualmente ni se arranca Docker antes del preflight.

## Requisitos

- Ubuntu o Debian actualizado.
- Git, Docker Engine, `docker compose`, OpenSSL y curl.
- Usuario con permiso para Docker.
- Móvil con aplicación TOTP.

## Descargar

```bash
cd /opt
sudo git clone https://github.com/izc05/atelier-lumiere-demo.git atelier-lumiere
sudo chown -R "$USER":"$USER" /opt/atelier-lumiere
cd /opt/atelier-lumiere/source
```

## Crear configuración privada

Para acceso local inicial:

```bash
npm run init:mini-pc -- --app-url http://IP_DEL_MINI_PC:3000
```

El comando crea `.env` con permisos `600`, secretos aleatorios, producción activada y todas las funciones de pedido, correo y sandbox apagadas.

## Comprobar e instalar

```bash
npm run preflight:mini-pc -- --mode install
npm run deploy:mini-pc -- install
```

No continuar si el preflight muestra errores. El despliegue aplica migraciones, arranca PostgreSQL, API y web y verifica su salud.

## Primer propietario

Con la persona responsable presente:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml \
  exec -it api npm run bootstrap:platform-owner
```

Guardar los diez códigos de recuperación fuera del mini PC. Después activar `ENABLE_ADMIN_UI=true` y recrear API y web.

## SMTP

```bash
npm run configure:smtp
```

El asistente prueba conexión y entrega, no muestra la contraseña y conserva una copia del `.env` anterior. Los avisos de pedido permanecen apagados hasta confirmar el mensaje recibido.

## Copia completa

```bash
npm run backup:pilot -- /opt/atelier-backups
```

La copia detiene brevemente las escrituras y genera un conjunto verificado. La copia PostgreSQL incluye una **prueba de restauración** completa en una base temporal antes de considerarse válida, con:

- PostgreSQL comprimido, SHA-256 y metadatos;
- fotografías, vídeos y documentos privados, SHA-256 y metadatos;
- manifiesto que empareja ambos archivos con el commit desplegado.

Configurar `PILOT_BACKUP_MIRROR_DIR` para duplicar cada conjunto fuera del disco principal.

## Operación automática

```bash
sudo npm run install:pilot-operations
```

Instala una copia diaria a las 03:30 y una comprobación de salud cada quince minutos. La retención predeterminada es de 14 días.

## Actualización

```bash
npm run preflight:mini-pc -- --mode update
npm run deploy:mini-pc -- update
```

La actualización crea y verifica primero la copia completa, y solo después descarga `origin/main`, construye y migra. Nunca borra volúmenes ni restaura automáticamente.

## Restauración PostgreSQL

La restauración de la base activa exige autorización literal:

```bash
npm run restore:database -- \
  /opt/atelier-backups/atelier-FECHA.dump \
  RESTORE_ACTIVE_DATABASE
```

La base anterior se conserva como rollback. Para recuperar los archivos privados del mismo conjunto, usar el archivo multimedia indicado por el manifiesto:

```bash
npm run restore:media -- \
  /opt/atelier-backups/atelier-media-FECHA.tar.gz \
  RESTORE_MEDIA_VOLUME
```

El comando verifica SHA-256 y rutas, detiene las escrituras, crea una copia de rollback del volumen actual y la conserva. La recuperación completa de un incidente debe usar siempre la base y la multimedia del mismo manifiesto.

## Diagnóstico

```bash
npm run health:mini-pc
docker compose --env-file .env -f infra/docker/docker-compose.yml ps -a
docker compose --env-file .env -f infra/docker/docker-compose.yml \
  logs --tail=200 migrate api web database
```

Nunca ejecutar `docker compose down -v`, borrar `database_data` o compartir `.env`, contraseñas, TOTP o códigos de recuperación.
