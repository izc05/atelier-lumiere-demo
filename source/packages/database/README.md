# Base de datos de Atelier Lumière

## Migraciones

Las migraciones de producción están en `migrations/` y se ejecutan por orden de nombre. Docker monta esta carpeta en `/docker-entrypoint-initdb.d` únicamente cuando crea un volumen PostgreSQL vacío.

Los datos ficticios están en `seeds/` y nunca se cargan automáticamente en producción.

## Contexto de seguridad

Cada petición autenticada deberá abrir una transacción y establecer antes de consultar datos:

```sql
SELECT set_config('app.role', 'PROVIDER_OWNER', true);
SELECT set_config('app.user_id', '<uuid del usuario>', true);
SELECT set_config('app.provider_id', '<uuid del taller>', true);
```

El tercer parámetro `true` limita el valor a la transacción actual. La API no deberá reutilizar una conexión sin limpiar o redefinir este contexto.

## Roles de aplicación

- `ADMIN`: supervisión completa.
- `PROVIDER_OWNER`: gestiona su taller y sus miembros.
- `PROVIDER_MEMBER`: acceso operativo limitado al taller.
- `CUSTOMER`: no accede a tablas privadas de proveedores.

## Tablas del Bloque 1

- `users`
- `providers`
- `provider_members`
- `provider_invitations`
- `sessions`
- `audit_events`

Todas tienen seguridad por fila cuando corresponde. `providers`, `provider_members`, `provider_invitations` y `audit_events` se aíslan mediante `app.provider_id`.

## Prueba de aislamiento

La prueba `tests/tenant_isolation.sql` crea un rol PostgreSQL sin privilegios especiales y verifica que:

- Taller A solo ve y modifica Taller A.
- Taller B solo ve Taller B.
- Un colaborador no modifica el perfil del taller.
- Un cliente no lee datos privados.
- Administración puede supervisar ambos talleres.

Los correos de `seeds/` utilizan el dominio reservado `.example` y no representan personas reales.
