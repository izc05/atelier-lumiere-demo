# Hoja de ruta de Atelier Lumière

Actualizada después de integrar Administración real, migraciones incrementales, copias verificadas y el asistente operativo del mini PC.

## Estado global

| Bloque | Resultado | Estado |
|---|---|---|
| 0 | Base técnica y protección de la demo | Completado |
| 1 | PostgreSQL, identidades, roles y RLS | Completado |
| 2 | Gestión real de proveedores | Completado para piloto |
| 3 | Incorporación, autenticación y panel privado | Completado para proveedores |
| 4 | Catálogo, fotografías, vídeo y revisión | Completado |
| 5 | Blog editorial | Completado |
| 6 | Pedidos, encargos, archivos y logística | Completado sin pago real |
| 7 | Legal y privacidad | Base técnica completada; textos pendientes de revisión profesional |
| 8A | Administración real | Base operativa completada; recuperación y permisos finos pendientes |
| 8B | Modelo comercial y contractual | Pendiente de decisión |
| 8C | Pagos sandbox | Pendiente |
| 8D | Migraciones y recuperación operativa | Completado para instalaciones nuevas |
| 9 | Mini PC y piloto privado | Herramientas preparadas; instalación real pendiente |
| 10 | Unificación visual y apertura | Pendiente |

## Bloques completados

### Bloque 0 · Base técnica

- Demo pública protegida.
- Aplicación real separada en `source/`.
- Web, API, Docker y pruebas.
- Estrategia de ramas y Pull Requests.

### Bloque 1 · Datos y aislamiento

- PostgreSQL.
- Usuarios, talleres, membresías, invitaciones y sesiones.
- Auditoría.
- RLS forzada.
- Pruebas con dos talleres independientes.

### Bloque 2 · Proveedores

- Alta cerrada desde Administración.
- Invitaciones y renovaciones.
- Pausa, reactivación y seguimiento del alta.
- Perfil y miembros.

### Bloque 3 · Acceso privado

- Aceptación de invitación.
- Verificación de correo.
- Contraseña segura.
- TOTP y recuperación.
- Inicio de sesión en dos pasos.
- Sesión `HttpOnly`.
- Panel privado.
- SMTP preparado.

### Bloque 4 · Catálogo

- Artículos y personalización.
- Stock, precio y preparación.
- Ocho imágenes y un vídeo.
- Almacenamiento privado.
- Preview WebP.
- Revisión y publicación administrativa.
- Catálogo público real.

### Bloque 5 · Blog

- Editor privado.
- Portada y galería.
- Productos relacionados.
- Revisión administrativa.
- Blog público.

### Bloque 6 · Pedidos y encargos

- Pedidos separados por taller.
- Cliente privado.
- Conversaciones y archivos.
- Presupuestos y aprobación.
- Seguimientos e incidencias.
- Checkout piloto e idempotencia.
- Sin cobro real.

### Bloque 7 · Legal y privacidad

- Ocho borradores legales.
- Versiones y SHA-256.
- Revisión profesional obligatoria.
- Inmutabilidad.
- Snapshots del checkout.
- Centro de privacidad.
- Preferencias anónimas hasheadas.
- Historial append-only.
- Sin analítica ni marketing conectado.

### Bloque 8A · Administración real

Completado:

- Cuentas administrativas persistentes en PostgreSQL.
- Roles `PLATFORM_OWNER`, `PROVIDER_MANAGER` y `EDITORIAL_REVIEWER`.
- Servicio interno `AUTH_SERVICE` sin taller.
- Contraseña `scrypt`, TOTP y códigos de recuperación.
- Desafíos de acceso, sesiones revocables y auditoría.
- Panel web mediante BFF y cookie `HttpOnly`.
- Eliminación de claves provisionales del contenedor web.
- Creador interactivo y único del primer `PLATFORM_OWNER`.

Pendiente:

- [ ] Recuperación específica de cuentas administrativas.
- [ ] Gestión de administradores desde el panel.
- [ ] Aplicar permisos mínimos efectivos a cada rol.
- [ ] Revocación y rotación operativa de 2FA desde Administración.

**Criterio de cierre restante:** recuperar y administrar cuentas sin recurrir a SQL ni a secretos provisionales.

### Bloque 8D · Migraciones, copias y recuperación

Completado:

- Tabla `schema_migrations`.
- Nombre completo y SHA-256 de cada migración.
- Detección de pendientes e historiales alterados.
- Bloqueo de ejecuciones simultáneas.
- Servicio Docker `migrate` previo a la API.
- Instalación y segunda ejecución idempotente probadas sobre PostgreSQL real.
- Copia PostgreSQL comprimida con SHA-256 y metadatos.
- Restauración temporal obligatoria para validar cada copia.
- Restauración activa mediante intercambio de bases.
- Conservación de la base anterior como rollback.
- Ciclo completo probado automáticamente en Docker.
- Generador privado de `.env`.
- Preflight del mini PC.
- Instalación y actualización guiadas con registro de despliegue.

Pendiente para instalaciones antiguas:

- [ ] Procedimiento revisado de adopción de una base con tablas pero sin `schema_migrations`.

## Siguiente trabajo recomendado

### Paso 8B · Decisión comercial y contractual

Este paso debe cerrarse antes de programar pagos.

- [ ] Definir quién es el vendedor contractual.
- [ ] Definir si Atelier Lumière actúa como intermediario o revendedor.
- [ ] Confirmar un taller por checkout o diseñar separación visible multi-taller.
- [ ] Definir comisión, costes de pasarela y liquidaciones.
- [ ] Definir quién factura al cliente.
- [ ] Definir reembolsos, devoluciones y productos personalizados.
- [ ] Identificar obligaciones fiscales y contables.
- [ ] Actualizar borradores legales según las decisiones.

**Recomendación técnica actual:** limitar cada checkout a un único taller para simplificar pago, factura, envío, reembolso y responsabilidad.

### Paso 8C · Pagos sandbox

- [ ] Elegir proveedor compatible con el modelo comercial aprobado.
- [ ] Crear pagos mediante redirección segura.
- [ ] No recibir tarjetas, CVV ni credenciales bancarias.
- [ ] Validar webhooks firmados.
- [ ] Añadir idempotencia de pagos.
- [ ] Estados de pago y conciliación.
- [ ] Reembolsos totales y parciales.
- [ ] Justificantes y comunicaciones.
- [ ] Pruebas de fallo, repetición y webhook tardío.

**Criterio de cierre:** una compra sandbox puede pagarse, confirmarse, cancelarse y reembolsarse sin confiar en el navegador.

## Bloque 9 · Mini PC y piloto privado

### Preparación completada en el repositorio

- Docker Compose con PostgreSQL, migraciones, API y web.
- Volúmenes persistentes.
- Healthchecks reales.
- API limitada a localhost.
- Generación automática de secretos y `.env` privado.
- Preflight del equipo y configuración.
- Instalación guiada sobre base vacía.
- Actualización guiada con copia verificada previa.
- Copia, restauración de prueba y rollback.
- Registros privados de despliegue.
- Guías específicas para la persona responsable y para Codex.

### Trabajo pendiente en el mini PC real

- [ ] Clonar o actualizar `main` en `/opt/atelier-lumiere`.
- [ ] Generar `.env` con la URL local inicial.
- [ ] Ejecutar preflight e instalación.
- [ ] Crear el primer `PLATFORM_OWNER` presencialmente.
- [ ] Configurar SMTP real.
- [ ] Activar HTTPS y cookies `Secure`.
- [ ] Configurar Cloudflare Tunnel.
- [ ] Asignar dominio o subdominio.
- [ ] Programar copia diaria y retención.
- [ ] Copiar backups fuera del mini PC.
- [ ] Copiar el volumen multimedia.
- [ ] Rotación de logs.
- [ ] Monitorización de espacio y servicios.

### Piloto

- [ ] Dos proveedores de confianza.
- [ ] Entre diez y veinte productos reales.
- [ ] Una historia de blog por taller.
- [ ] Pedido normal completo.
- [ ] Encargo personalizado completo.
- [ ] Cancelación e incidencia.
- [ ] Recuperación de contraseña y 2FA.
- [ ] Prueba móvil y escritorio.
- [ ] Restauración de una copia del mini PC.

**Criterio de cierre:** el MVP privado funciona desde fuera de casa y puede recuperarse ante un fallo.

## Bloque 10 · Experiencia pública definitiva

- [ ] Trasladar la portada premium a la aplicación real.
- [ ] Entrada interactiva y efectos de desplazamiento.
- [ ] Cabecera y navegación definitivas.
- [ ] Fichas editoriales de producto y taller.
- [ ] Diseño móvil completo.
- [ ] Accesibilidad.
- [ ] Rendimiento y optimización de imágenes.
- [ ] SEO, sitemap y metadatos sociales.
- [ ] Páginas de error y estados vacíos.
- [ ] Pruebas con usuarios.
- [ ] Sustituir GitHub Pages por la aplicación real cuando iguale o supere la demo.

## Condiciones para abrir ventas reales

No se abrirán ventas hasta cumplir conjuntamente:

1. recuperación y permisos administrativos completados;
2. modelo comercial y contractual aprobado;
3. pagos sandbox validados;
4. textos legales revisados profesionalmente;
5. mini PC con copias externas y monitorización;
6. piloto privado satisfactorio;
7. aplicación pública con calidad visual y móvil suficiente.
