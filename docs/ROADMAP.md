# Hoja de ruta de Atelier Lumière

Actualizada después de integrar la portada pública real, la recuperación administrativa, los permisos efectivos, el pago sandbox, el escaparate de talleres, la experiencia privada del cliente, los avisos transaccionales y la gestión operativa de administradores.

## Estado global

| Bloque | Resultado | Estado |
|---|---|---|
| 0 | Base técnica y protección de la demo | Completado |
| 1 | PostgreSQL, identidades, roles y RLS | Completado |
| 2 | Gestión real de proveedores | Completado para piloto |
| 3 | Incorporación, autenticación y panel privado | Completado para proveedores |
| 4 | Catálogo, fotografías, vídeo y revisión | Completado |
| 5 | Blog editorial | Completado |
| 6 | Pedidos, encargos, archivos y logística | Completado para piloto |
| 7 | Legal y privacidad | Base técnica completada; revisión profesional pendiente |
| 8A | Administración real | Acceso, recuperación, permisos y operación completados |
| 8B | Modelo comercial y contractual | Pendiente de decisión |
| 8C | Pago sandbox genérico | Completado y desactivado por defecto |
| 8D | Migraciones, copias y recuperación | Completado para instalaciones nuevas |
| 9 | Mini PC y piloto privado | Herramientas preparadas; instalación real pendiente |
| 10 | Experiencia pública y cliente | En desarrollo avanzado |
| 11 | Avisos automáticos de pedido | Preparados para piloto; activación SMTP pendiente |

## Capacidades completadas

### Plataforma y seguridad

- Aplicación real separada de la demo de GitHub Pages.
- Node.js, PostgreSQL 17, Docker Compose y migraciones incrementales.
- RLS forzada y pruebas con talleres independientes.
- Auditoría, sesiones revocables y servicios técnicos con permisos mínimos.
- Copias verificadas, restauración aislada, intercambio seguro de bases y rollback.
- Generador privado de `.env`, preflight, instalación y actualización del mini PC.

### Proveedores

- Alta cerrada desde Administración.
- Invitaciones, verificación de correo, contraseña, TOTP y recuperación.
- Panel privado, miembros, perfil, catálogo, blog, pedidos y encargos.
- Fotografías, vídeo, previews WebP y almacenamiento privado.

### Administración

- Cuentas persistentes con roles `PLATFORM_OWNER`, `PROVIDER_MANAGER` y `EDITORIAL_REVIEWER`.
- Inicio de sesión mediante contraseña, TOTP y cookie `HttpOnly`.
- Recuperación de cuenta con contraseña y autenticador nuevos.
- Revocación de sesiones y rotación de códigos de recuperación.
- Permisos efectivos por ruta y rol, aplicados también en servidor.
- Creador interactivo y único del primer `PLATFORM_OWNER`.
- Alta de administradores desde el panel mediante enlace de activación de un solo uso.
- Suspensión y reactivación con revocación de sesiones, desafíos y enlaces pendientes.
- Consulta de sesiones activas y cierre remoto individual o total.
- Protección transaccional para conservar al menos un propietario activo.

### Compra y posventa

- Un único taller por checkout.
- Varios artículos del mismo taller con envío compartido.
- Precios recalculados por el servidor e idempotencia.
- Pedidos, encargos personalizados, presupuestos y aprobación del cliente.
- Conversaciones, archivos, seguimiento, logística e incidencias.
- Acceso privado del cliente mediante enlace de un solo uso.
- Panel con búsqueda y filtros por situación.
- Progreso visual y próxima actuación de cada pedido.
- Enlace al escaparate del taller desde el detalle privado.
- Resumen preparado para imprimir o guardar como PDF desde el navegador.

### Avisos transaccionales

- Confirmación de compra para cliente y taller.
- Cambios de estado, elaboración, envío y entrega.
- Presupuestos, mensajes privados e incidencias.
- Cola PostgreSQL con deduplicación por evento y destinatario.
- Procesamiento concurrente mediante `FOR UPDATE SKIP LOCKED`.
- Reintentos exponenciales y cierre tras el máximo configurado.
- Identificador estable del mensaje para reducir duplicados tras reinicios.
- Correos sin conversaciones, direcciones, archivos ni datos bancarios.
- Servicio `NOTIFICATION_SERVICE` aislado mediante una proyección de datos mínima.
- Interruptor independiente, desactivado por defecto hasta probar el SMTP real.

### Pago sandbox

- Intentos de pago separados del pedido.
- Estados, firma HMAC e idempotencia de webhooks.
- Simulación de aprobación y rechazo sin datos bancarios.
- Registro de cronología y auditoría sin guardar el cuerpo del webhook.
- Servicio `PAYMENT_SERVICE` aislado.
- Desactivado por defecto e inutilizable en producción.
- No mueve dinero y `paymentCollected` permanece en `false`.

### Experiencia pública

- Portada premium real conectada a PostgreSQL.
- Tienda, ficha de producto, carrito, blog y navegación responsive.
- Escaparate público de cada taller y búsqueda dentro de su colección.
- Enlaces desde las piezas hacia su artesano.
- Estados de carga, vacío y error sin exponer datos privados.

## Trabajo pendiente en el repositorio

### Administración operativa

- [x] Crear, suspender y reactivar administradores desde el panel.
- [ ] Rotar o revocar 2FA de otra cuenta con autorización reforzada.
- [x] Historial visual de sesiones activas y cierres remotos.
- [ ] Segundo paso de confirmación reforzada para acciones de alto impacto.

### Área del cliente

- [x] Unificar visualmente listado, detalle, conversaciones, archivos e incidencias.
- [x] Búsqueda y filtros por pedidos en curso, con atención y finalizados.
- [x] Panel de progreso y próxima actuación.
- [x] Resumen imprimible del pedido.
- [x] Confirmaciones y comunicaciones automáticas preparadas.
- [ ] Configurar y verificar el SMTP real del piloto.
- [ ] Activar los avisos y revisar entregabilidad con cuentas reales.
- [ ] Prueba de usabilidad móvil con clientes reales.

### Experiencia pública definitiva

- [x] Portada premium en la aplicación real.
- [x] Cabecera, tienda, ficha, carrito y blog responsive.
- [x] Ficha pública de taller.
- [ ] Efectos de desplazamiento y movimiento con reducción accesible.
- [ ] Navegación móvil común para todas las páginas.
- [ ] Accesibilidad y navegación completa por teclado.
- [ ] Optimización final de imágenes y rendimiento.
- [ ] Metadatos sociales, sitemap y SEO al finalizar el piloto privado.
- [ ] Páginas 404/500 definitivas.
- [ ] Pruebas con usuarios reales.

### Modelo comercial y contractual

Debe decidirse antes de elegir y activar una pasarela real:

- [ ] Quién es el vendedor contractual.
- [ ] Si Atelier Lumière actúa como intermediario o revendedor.
- [ ] Comisión, costes y liquidaciones a talleres.
- [ ] Quién emite la factura.
- [ ] Reembolsos, devoluciones y productos personalizados.
- [ ] Obligaciones fiscales y contables.
- [ ] Adaptación profesional de los textos legales.

La decisión técnica vigente es **un taller por checkout**.

## Mini PC y piloto privado

### Trabajo pendiente en el equipo real

- [ ] Clonar o actualizar `main` en `/opt/atelier-lumiere`.
- [ ] Generar `.env`, ejecutar preflight e instalación.
- [ ] Crear presencialmente el primer `PLATFORM_OWNER`.
- [ ] Configurar y verificar SMTP.
- [ ] Activar avisos automáticos después de la prueba SMTP.
- [ ] Activar HTTPS, cookies `Secure` y Cloudflare Tunnel.
- [ ] Asignar dominio o subdominio.
- [ ] Programar copias diarias y retención.
- [ ] Copiar base y multimedia fuera del mini PC.
- [ ] Añadir rotación de logs y monitorización de espacio y servicios.

### Prueba piloto

- [ ] Dos proveedores de confianza.
- [ ] Entre diez y veinte productos reales.
- [ ] Una historia de blog por taller.
- [ ] Pedido normal y encargo personalizado completos.
- [ ] Pago sandbox aprobado y rechazado.
- [ ] Confirmación, cambio de estado, presupuesto e incidencia por email.
- [ ] Cancelación, incidencia y recuperación de acceso.
- [ ] Prueba móvil y escritorio.
- [ ] Restauración real de una copia del mini PC.

## Condiciones para abrir ventas reales

No se activarán cobros reales hasta cumplir conjuntamente:

1. modelo comercial y contractual aprobado;
2. pasarela real elegida y validada en sandbox oficial;
3. textos legales revisados profesionalmente;
4. mini PC con HTTPS, copias externas y monitorización;
5. piloto privado satisfactorio;
6. administración operativa completada;
7. experiencia pública y área de cliente validadas con usuarios.
