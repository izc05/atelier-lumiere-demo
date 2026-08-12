# Base de datos de Atelier Lumière

## Migraciones incrementales

Las migraciones de producción están en `migrations/` y se ejecutan por orden de nombre mediante `apps/api/src/migrate-database.mjs`.

El ejecutor:

1. adquiere un bloqueo PostgreSQL exclusivo;
2. crea la tabla técnica `schema_migrations` cuando no existe;
3. comprueba nombre, versión y SHA-256 de cada archivo ya aplicado;
4. rechaza archivos modificados, eliminados o historiales con huecos;
5. aplica únicamente las migraciones pendientes;
6. ejecuta el contenido y registra el checksum dentro de la misma transacción;
7. libera el bloqueo antes de terminar.

Todos los archivos deben usar el formato `0001_nombre_descriptivo.sql`, comenzar con `BEGIN;` y terminar con `COMMIT;`. El ejecutor retira únicamente ese envoltorio exterior y controla la transacción real para que la migración y su registro sean atómicos.

Docker utiliza un servicio de una sola ejecución llamado `migrate`. La API solo arranca cuando ese servicio termina correctamente. La carpeta ya no se monta en `/docker-entrypoint-initdb.d`.

Una base con tablas pero sin registros en `schema_migrations` se considera una instalación antigua no adoptada. El sistema se detiene con `UNTRACKED_EXISTING_SCHEMA` y no intenta adivinar qué cambios existen. Debe hacerse una copia y utilizar un procedimiento de adopción revisado antes de continuar.

Los datos ficticios están en `seeds/` y nunca se cargan automáticamente en producción.

## Contexto de seguridad

Cada petición autenticada abre una transacción y establece antes de consultar datos:

```sql
SELECT set_config('app.role', 'PROVIDER_OWNER', true);
SELECT set_config('app.user_id', '<uuid del usuario>', true);
SELECT set_config('app.provider_id', '<uuid del taller>', true);
```

El tercer parámetro `true` limita el valor a la transacción actual. La API no reutiliza una conexión sin redefinir este contexto.

El ejecutor de migraciones no utiliza el rol limitado de la aplicación. Se conecta con el propietario de la base únicamente durante el proceso previo al arranque y no expone ninguna ruta HTTP.

## Roles de aplicación

- `ADMIN`: supervisión completa y operaciones internas controladas.
- `AUTH_SERVICE`: autenticación sin contexto de taller.
- `LEGAL_SERVICE`: documentos y preferencias legales.
- `PROVIDER_OWNER`: gestiona su taller y sus miembros.
- `PROVIDER_MEMBER`: acceso operativo limitado al taller.
- `CUSTOMER`: acceso privado a sus pedidos.
- `CATALOG_READER`: lectura pública limitada.

## Tablas centrales

Entre otras:

- `users`
- `user_credentials`
- `email_verification_tokens`
- `providers`
- `provider_members`
- `provider_invitations`
- `sessions`
- `admin_memberships`
- `admin_totp_credentials`
- `audit_events`
- `schema_migrations`

Las tablas de aplicación tienen seguridad por fila cuando corresponde. `schema_migrations` permanece reservada al propietario PostgreSQL y no se concede al rol de ejecución de la API.

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

Aceptar la invitación **no concede acceso**. El usuario y la membresía permanecen pendientes hasta completar:

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

## Prueba de aislamiento

La prueba `tests/tenant_isolation.sql` crea un rol PostgreSQL sin privilegios especiales y verifica que:

- Taller A solo ve y modifica Taller A.
- Taller B solo ve Taller B.
- Un colaborador no modifica el perfil del taller.
- Un cliente no lee datos privados.
- Administración puede supervisar ambos talleres.

Los correos de `seeds/` utilizan el dominio reservado `.example` y no representan personas reales.

## Solicitudes de taller

`workshop_applications` reutiliza el flujo de incorporación existente y mantiene estos estados reales:

- `PENDING`: solicitud nueva o reenviada, sin revisión activa ni provider asignado.
- `CHANGES_REQUESTED`: administración ha revisado la solicitud y espera una nueva versión.
- `APPROVED`: estado terminal con revisión y `provider_id` asignado.
- `REJECTED`: estado terminal revisado y sin provider asignado.

Las únicas transiciones de estado son `PENDING -> CHANGES_REQUESTED`, `PENDING -> APPROVED`,
`PENDING -> REJECTED` y `CHANGES_REQUESTED -> PENDING`. El reenvío incrementa
`submission_version` y vuelve a registrar la aceptación de privacidad. Las filas anteriores a la
migración `0055` conservan la versión 1 sin inventar evidencia de consentimiento; toda inserción
nueva usa la versión 2 o una posterior y exige `privacy_accepted_at` y
`privacy_document_version`.

Solo `ADMIN` y el contexto interno `AUTH_SERVICE` estrictamente necesario pueden leer solicitudes.
El servicio de autenticación puede insertar solicitudes y devolver una solicitud con cambios a
`PENDING`; proveedores, clientes, catálogo y contextos anónimos no tienen visibilidad. Los eventos
de auditoría de solicitudes no reciben `provider_id` ni contenido sensible.

El correo tiene unicidad parcial mientras la solicitud está `PENDING` o `CHANGES_REQUESTED`; una
persona puede volver a solicitar después de un rechazo. `proposed_slug` se contrasta con slugs de
providers existentes y se indexa para solicitudes activas, pero no es único entre solicitudes ni
reserva el slug definitivo. La asignación continúa perteneciendo a la aprobación.

La conversión actual de una solicitud aprobada crea primero el provider y la invitación y marca la
solicitud en una transacción posterior. Esa falta de atomicidad queda deliberadamente pendiente para
la fase de aprobación/conversión; la migración `0055` no modifica ese flujo.
