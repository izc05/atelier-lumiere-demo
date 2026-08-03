# Hoja de ruta de Atelier Lumière

Actualizada después de integrar el centro legal y de privacidad.

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
| 8 | Administración, modelo comercial y pagos | Pendiente |
| 9 | Mini PC y piloto privado | Parcialmente preparado |
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

## Siguiente trabajo recomendado

### Paso 8A · Administración real

Objetivo: eliminar la dependencia de secretos administrativos provisionales.

- [ ] Crear cuentas administrativas en PostgreSQL.
- [ ] Añadir contraseña, verificación de correo y 2FA.
- [ ] Recuperación de cuenta.
- [ ] Sesiones administrativas revocables.
- [ ] Roles: propietario de plataforma, gestor de proveedores y revisor editorial.
- [ ] Auditoría de inicios de sesión y acciones.
- [ ] Desactivar `DEV_ADMIN_TOKEN` y `WEB_ADMIN_ACCESS_KEY` en producción.

**Criterio de cierre:** el panel puede publicarse mediante HTTPS sin autenticación provisional.

### Paso 8B · Decisión comercial y contractual

Este paso debe cerrarse antes de programar pagos.

- [ ] Definir quién es el vendedor contractual.
- [ ] Definir si Atelier Lumière actúa como intermediario o revendedor.
- [ ] Decidir el modelo de carrito:
  - un taller por checkout; o
  - carrito visual multi-taller con pagos/pedidos separados.
- [ ] Definir comisión, costes de pasarela y liquidaciones.
- [ ] Definir quién factura al cliente.
- [ ] Definir reembolsos, devoluciones y productos personalizados.
- [ ] Identificar obligaciones fiscales y contables.
- [ ] Actualizar borradores legales según las decisiones.

**Recomendación técnica actual:** limitar cada checkout a un único taller para simplificar pago, factura, envío, reembolso y responsabilidad.

### Paso 8C · Pagos sandbox

- [ ] Elegir proveedor de pagos compatible con el modelo comercial.
- [ ] Crear pagos mediante redirección segura.
- [ ] No recibir tarjetas, CVV ni credenciales bancarias.
- [ ] Validar webhooks firmados.
- [ ] Añadir idempotencia de pagos.
- [ ] Estados de pago y conciliación.
- [ ] Reembolsos totales y parciales.
- [ ] Justificantes y comunicaciones.
- [ ] Pruebas de fallo, repetición y webhook tardío.

**Criterio de cierre:** una compra sandbox completa puede pagarse, confirmarse, cancelarse y reembolsarse sin confiar en el navegador.

### Paso 8D · Migraciones de producción

- [ ] Crear tabla `schema_migrations`.
- [ ] Añadir comando `npm run db:migrate`.
- [ ] Detectar migraciones pendientes.
- [ ] Bloquear ejecuciones simultáneas.
- [ ] Crear copia previa a cada actualización.
- [ ] Documentar rollback o recuperación.

**Criterio de cierre:** una base existente puede actualizarse sin recrear el volumen.

## Bloque 9 · Mini PC y piloto privado

### Preparación ya existente

- Docker Compose.
- Web, API y PostgreSQL.
- Volúmenes persistentes.
- Health checks.
- API limitada a localhost.
- Variables de entorno documentadas.

### Trabajo pendiente

- [ ] Configurar secretos reales.
- [ ] Configurar SMTP.
- [ ] Activar HTTPS y cookies `Secure`.
- [ ] Configurar Cloudflare Tunnel.
- [ ] Asignar dominio o subdominio.
- [ ] Copia diaria de PostgreSQL.
- [ ] Copia del volumen multimedia.
- [ ] Prueba documentada de restauración.
- [ ] Rotación de logs.
- [ ] Monitorización de espacio y servicios.
- [ ] Actualización desplegable por versión.

### Piloto

- [ ] Dos proveedores de confianza.
- [ ] Entre diez y veinte productos reales.
- [ ] Una historia de blog por taller.
- [ ] Pedido normal completo.
- [ ] Encargo personalizado completo.
- [ ] Cancelación e incidencia.
- [ ] Recuperación de contraseña y 2FA.
- [ ] Prueba móvil y escritorio.
- [ ] Restauración de una copia.

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

1. administración real y segura;
2. modelo comercial y contractual aprobado;
3. pagos sandbox validados;
4. textos legales revisados profesionalmente;
5. migraciones incrementales;
6. copias y restauración probadas;
7. piloto privado satisfactorio;
8. aplicación pública con calidad visual y móvil suficiente.
