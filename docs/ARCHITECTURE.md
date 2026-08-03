# Arquitectura actual de Atelier Lumière

## Visión general

Atelier Lumière mantiene deliberadamente dos capas dentro del mismo repositorio:

1. una **demo pública estable**, utilizada como referencia visual y publicada mediante GitHub Pages;
2. una **aplicación real mantenible**, situada en `source/`, donde viven la web, la API, PostgreSQL, los permisos y la operativa privada.

La separación permite continuar el desarrollo sin romper la demostración que pueden revisar proveedores y colaboradores.

## Capa 1 · Demo pública protegida

**Ubicación:** raíz del repositorio.

Incluye:

- identidad Atelier Lumière;
- portada y entrada interactiva;
- rutas visuales de tienda, cuenta, carrito y Administración;
- flujos de demostración con datos ficticios;
- recursos gráficos y animaciones de referencia.

No contiene la fuente principal del backend ni debe almacenar datos reales. Cualquier cambio en esta capa debe superar `npm test`.

## Capa 2 · Aplicación real

**Ubicación:** `source/`.

### Web

`source/apps/web` sirve HTML, CSS y JavaScript mantenibles. También actúa como BFF para que:

- las cookies privadas permanezcan `HttpOnly`;
- el navegador no reciba tokens internos;
- se limiten métodos y rutas permitidas;
- archivos y previews se transmitan por streaming;
- las respuestas privadas conserven cabeceras de seguridad.

Contiene:

- tienda y blog públicos;
- acceso e incorporación de proveedores;
- panel privado del taller;
- panel administrativo provisional;
- pedidos y encargos de cliente y proveedor;
- carrito y checkout piloto;
- centro legal y de privacidad.

### API

`source/apps/api` implementa los servicios de dominio mediante Node.js y módulos ECMAScript.

Responsabilidades principales:

- proveedores, invitaciones y auditoría;
- verificación de correo y doble factor;
- inicio de sesión y recuperación de cuentas;
- catálogo, medios y revisión editorial;
- blog y multimedia;
- pedidos, encargos, archivos y logística;
- checkout piloto;
- documentos legales y preferencias de privacidad.

La API pública del contenedor se publica únicamente en `127.0.0.1`; la web se comunica con ella por la red interna de Docker.

### PostgreSQL

PostgreSQL 17 es la fuente de verdad para identidades, talleres, catálogo, blog, pedidos, auditoría y evidencia legal.

Principios:

- migraciones SQL ordenadas;
- UUID generados mediante `pgcrypto`;
- consultas parametrizadas;
- una transacción por operación;
- contexto de rol, usuario y taller establecido con `set_config`;
- Row Level Security activada y forzada;
- roles técnicos separados para catálogo y servicio legal;
- snapshots inmutables para datos contractuales;
- eventos de consentimiento append-only.

Cada conexión entra como rol técnico sin `BYPASSRLS`. Antes de consultar se establece:

```sql
SELECT set_config('app.role', '<ROL>', true);
SELECT set_config('app.user_id', '<UUID>', true);
SELECT set_config('app.provider_id', '<UUID O VACÍO>', true);
```

## Identidad y sesiones

### Proveedores

El flujo completo es:

1. Administración crea el taller y emite una invitación.
2. El proveedor acepta el enlace de un solo uso.
3. Crea una contraseña derivada con `scrypt`.
4. Verifica su correo.
5. Configura TOTP y guarda códigos de recuperación.
6. Administración activa finalmente el taller.
7. El proveedor inicia sesión en dos pasos.
8. La web conserva la sesión en cookie `HttpOnly`.

Los tokens de invitación, verificación, recuperación y sesión se almacenan únicamente como hashes.

### Clientes

El checkout piloto emite un enlace privado de un solo uso. Al consumirlo se crea una sesión revocable en cookie `HttpOnly`; el secreto se retira inmediatamente de la URL.

### Administración

La administración funcional existe, pero el acceso actual está diseñado para un piloto privado mediante secretos de entorno. Antes de producción debe sustituirse por usuarios administrativos reales con 2FA, recuperación y auditoría de acceso.

## Aislamiento multi-proveedor

Las tablas privadas incluyen o derivan un `provider_id`. PostgreSQL, y no solo la interfaz, impide:

- que un taller consulte artículos de otro;
- que relacione productos ajenos;
- que abra pedidos o encargos de otro proveedor;
- que acceda a archivos privados ajenos;
- que modifique revisiones administrativas;
- que un cliente resuelva incidencias reservadas al taller.

Las pruebas SQL crean dos talleres independientes y verifican los intentos de acceso cruzado.

## Multimedia y archivos privados

Los bytes no se guardan en PostgreSQL ni en GitHub.

Flujo:

1. la API crea una reserva temporal;
2. el archivo se escribe por streaming en una carpeta privada;
3. se valida el tipo binario real;
4. se calcula SHA-256;
5. las imágenes generan una preview WebP sin metadatos;
6. el archivo se mueve atómicamente a su ubicación final;
7. PostgreSQL registra únicamente metadatos y claves internas.

Las descargas privadas requieren sesión y utilizan `Content-Disposition`, `nosniff`, CSP sandbox y caché desactivada. Los vídeos y archivos admiten rangos HTTP.

## Catálogo y blog

Ambos módulos comparten un modelo editorial:

```text
DRAFT → IN_REVIEW → CHANGES_REQUESTED → APPROVED → PUBLISHED
```

El proveedor crea el contenido; Administración revisa y publica. PostgreSQL impide publicar sin aprobación y sin los medios obligatorios.

Las APIs públicas emplean un rol técnico de solo lectura y devuelven exclusivamente información publicada de talleres activos.

## Pedidos y encargos

El checkout piloto actual puede agrupar un carrito visual con artículos de varios talleres y crear un pedido independiente por proveedor. El servidor:

- ignora precios enviados por el navegador;
- recalcula productos y suplementos;
- aplica envío por taller;
- reserva stock dentro de una transacción;
- crea encargos personalizados;
- evita duplicados mediante idempotencia;
- emite el acceso privado del cliente.

Antes de pagos reales debe decidirse si este flujo se mantiene o si cada checkout se limita a un único taller.

## Legal y privacidad

La base contiene ocho tipos de documento:

- aviso legal;
- privacidad;
- cookies;
- compra;
- envíos y devoluciones;
- productos personalizados;
- proveedores;
- licencia de contenido.

Los borradores son visibles únicamente en desarrollo. En producción solo se sirven versiones `ACTIVE`, vigentes y profesionalmente revisadas. Una versión activa no puede reescribirse; solo retirarse.

El centro de privacidad usa una clave aleatoria en cookie técnica `HttpOnly`. PostgreSQL guarda únicamente su SHA-256 y un historial append-only de decisiones. No existe analítica ni marketing conectado actualmente.

## Contenedores y persistencia

Docker Compose levanta:

- `web`;
- `api`;
- `database`;
- volumen `database_data`;
- volumen `media_data`.

Los contenedores se ejecutan sin privilegios cuando corresponde, incluyen health checks y reinicio automático.

Las migraciones en `/docker-entrypoint-initdb.d` funcionan al crear un volumen vacío. Para una instalación con datos reales debe añadirse un ejecutor incremental con registro de migraciones aplicadas.

## Integración continua

GitHub Actions ejecuta tres familias de validación:

1. **Demo pública:** rutas, marca y recursos protegidos.
2. **Aplicación fuente:** contratos, interfaces, proxies, seguridad y Docker Compose.
3. **PostgreSQL:** todas las migraciones, semillas ficticias, RLS, catálogo, blog, pedidos, legal y pruebas de API.

No se fusiona una entrega funcional si estas comprobaciones no finalizan correctamente.

## Objetivo de despliegue

La aplicación real se desplegará en el mini PC mediante Docker Compose y se publicará mediante Cloudflare Tunnel sin abrir puertos del router.

Antes del piloto deben configurarse:

- dominio o subdominio;
- HTTPS y cookies `Secure`;
- secretos reales;
- SMTP;
- copias de PostgreSQL y multimedia;
- restauración probada;
- migraciones incrementales;
- monitorización y rotación de logs.

## Deuda pendiente antes de producción

1. Autenticación administrativa definitiva.
2. Modelo jurídico y comercial.
3. Decisión final del carrito y del vendedor contractual.
4. Pagos sandbox, webhooks, reembolsos y conciliación.
5. Facturación y comisiones.
6. Migraciones para bases existentes.
7. Copias y restauración.
8. Piloto con proveedores reales.
9. Revisión jurídica profesional.
10. Unificación visual de la aplicación real con la demo.
