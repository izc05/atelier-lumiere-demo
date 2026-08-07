# Escaparate público filtrado por taller

La página pública `/taller/?slug=...` no debe descargar el catálogo completo para filtrar después en el navegador.

## Flujo

1. El navegador valida el `slug` del taller.
2. Solicita `/internal/catalog/products?provider=<slug>`.
3. El BFF público transmite la petición sin credenciales.
4. La API valida el `slug` y el servicio aplica `provider.slug = $4` dentro de PostgreSQL.
5. Solo se devuelven productos `PUBLISHED` de un proveedor `ACTIVE`.
6. La identidad editorial, multimedia y piezas destacadas siguen saliendo del snapshot publicado del taller.

Este cambio no modifica checkout, pedidos, pagos ni notificaciones.
