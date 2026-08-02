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

## Tablas centrales

- `users`
- `user_credentials`
- `email_verification_tokens`
- `providers`
- `provider_members`
- `provider_invitations`
- `sessions`
- `audit_events`

Todas tienen seguridad por fila cuando corresponde. `providers`, `provider_members`, `provider_invitations` y `audit_events` se aíslan mediante `app.provider_id`.

## Incorporación del proveedor

La aceptación de una invitación se ejecuta de forma atómica:

1. Se calcula SHA-256 del token recibido y nunca se guarda el token original.
2. Se bloquea la invitación durante la transacción.
3. Se comprueba que siga pendiente, no haya caducado y el taller no esté suspendido.
4. Se crea el usuario con estado `PENDING`.
5. La contraseña se deriva con `scrypt-v1`, sal aleatoria individual y 64 bytes de salida.
6. Se crea la membresía con estado `INVITED`.
7. La invitación pasa a `ACCEPTED` y queda vinculada al usuario.
8. Se crea un enlace de verificación de correo de un solo uso.
9. Se registran los eventos correspondientes en auditoría.

Aceptar la invitación **no concede acceso**. El usuario y la membresía permanecerán pendientes hasta completar:

- verificación del correo electrónico;
- activación del doble factor;
- activación final de la membresía.

## Verificación del correo

Los enlaces de correo se almacenan únicamente como SHA-256 en `email_verification_tokens`.

- Caducan por defecto a las 24 horas.
- Solo puede existir un enlace pendiente por usuario.
- Un reenvío revoca inmediatamente el enlace anterior.
- Existe una espera mínima de 60 segundos entre reenvíos.
- Solo el enlace más reciente puede verificarse o solicitar otro reenvío.
- Un enlace verificado, revocado o sustituido no puede volver a utilizarse.
- Los tokens y sus hashes no se guardan en auditoría ni se incluyen en respuestas de producción.

Al verificar el correo se actualiza `users.email_verified_at`, pero el usuario continúa en estado `PENDING`, la membresía continúa `INVITED` y el acceso sigue bloqueado hasta activar 2FA.

Durante el piloto privado el token puede mostrarse manualmente en modo de desarrollo. En producción deberá entregarse exclusivamente mediante el servicio SMTP pendiente de configurar.

## Prueba de aislamiento

La prueba `tests/tenant_isolation.sql` crea un rol PostgreSQL sin privilegios especiales y verifica que:

- Taller A solo ve y modifica Taller A.
- Taller B solo ve Taller B.
- Un colaborador no modifica el perfil del taller.
- Un cliente no lee datos privados.
- Administración puede supervisar ambos talleres.

Los correos de `seeds/` utilizan el dominio reservado `.example` y no representan personas reales.
