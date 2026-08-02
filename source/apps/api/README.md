# API de Atelier Lumière

Esta API conecta la aplicación fuente con PostgreSQL y aplica seguridad por fila en cada transacción.

## Estado actual

Disponibles:

- `GET /health`
- `GET /api/meta`
- `GET /api/admin/providers`
- `POST /api/admin/providers`
- `PATCH /api/admin/providers/:id/status`
- `POST /api/admin/providers/:id/invitations`
- `GET /api/admin/providers/:id/audit`

## Acceso temporal de desarrollo

Las rutas administrativas solo pueden utilizar un token local cuando:

- `NODE_ENV` no es `production`.
- `ALLOW_DEV_ADMIN_AUTH=true`.
- `DEV_ADMIN_TOKEN` tiene al menos 32 caracteres.
- `DEV_ADMIN_USER_ID` contiene un UUID válido.

Este mecanismo sirve exclusivamente para el piloto privado. La autenticación definitiva con sesiones, correo verificado y doble factor seguirá en un bloque posterior.

## Seguridad de base de datos

Cada operación de negocio:

1. Abre una transacción.
2. cambia al rol PostgreSQL `atelier_app_runtime`, que no puede omitir RLS;
3. establece usuario, rol y proveedor con `set_config(..., true)`;
4. ejecuta consultas parametrizadas;
5. confirma o revierte la transacción;
6. devuelve siempre la conexión al pool.

Los tokens de invitación se generan aleatoriamente. La API solo guarda su hash SHA-256 y el valor original se devuelve una única vez durante las pruebas de desarrollo.
