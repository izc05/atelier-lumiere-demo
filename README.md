# Alma de Fiesta · demo pública

Demostración navegable de un marketplace curado de artesanía para bodas, comuniones, bautizos y celebraciones.

## Estado real del proyecto

Esta rama contiene una **demostración estática mantenible** para GitHub Pages. No realiza pagos, no envía formularios a un servidor y no dispone todavía de autenticación ni base de datos.

Incluye:

- Portada visible incluso antes de ejecutar JavaScript.
- Tienda con seis productos renderizados en HTML, filtros por evento y categoría.
- Carrito limitado a un único proveedor.
- Checkout local con pago Bizum simulado.
- Solicitudes de diseño propio que conservan nombre, correo y detalles en el navegador.
- Cuenta de demostración con historial de pedidos y encargos locales.
- Panel administrativo claramente identificado como público y ficticio.
- Páginas provisionales de aviso legal, privacidad y almacenamiento local.
- Reglas SEO básicas, `robots.txt` y sitemap.

## Estructura

```text
assets/
  app.css        Estilos compartidos
  app.js         Catálogo y flujos de demostración
  product.css    Ajustes responsive de la ficha
index.html       Portada
tienda/          Catálogo
producto/        Ficha dinámica por `?slug=`
carrito/         Carrito local
checkout/        Checkout simulado
cuenta/          Historial local
admin/           Panel público de demostración
blog/            Portada editorial
scripts/         Validación automática
```

Los antiguos archivos `_next/` permanecen temporalmente en el repositorio para no borrar recursos sin una migración controlada, pero las páginas principales ya no dependen de ellos.

## Comprobaciones

Requiere Node.js 22 o superior. No hay dependencias externas.

```bash
npm test
```

La validación comprueba:

- Sintaxis de `assets/app.js`.
- Presencia de páginas y recursos requeridos.
- Enlaces internos rotos.
- Ausencia de bundles minificados de Next.js en las rutas principales.
- Contenido visible en la portada y productos visibles en la tienda.
- `noindex` en cuenta, carrito, checkout y administración.
- Protección del carrito por proveedor y apertura de `?encargo=1`.

GitHub Actions ejecuta estas comprobaciones en cada pull request.

## Principios del producto

- Los proveedores son cerrados e invitados por administración.
- Cada carrito, pedido, pago y envío pertenece a un único proveedor.
- El cliente puede comprar varios artículos del mismo taller y compartir el envío.
- Cada artículo puede incorporar historia, fotografías, vídeo y solicitud personalizada.
- Administrador, proveedor y cliente tendrán permisos separados cuando exista backend.
- Las credenciales, datos personales, copias de base de datos y archivos reales nunca se almacenarán en GitHub.

## Siguiente fase técnica

La versión comercial deberá migrarse a una aplicación con:

- Backend protegido y PostgreSQL.
- Autenticación y verificación de correo.
- Roles de administrador, proveedor y cliente.
- Almacenamiento S3/MinIO para imágenes y vídeos.
- Correos transaccionales.
- Bizum/Redsys mediante redirección y confirmación firmada.
- Copias de seguridad, auditoría y despliegue en el mini PC mediante Cloudflare Tunnel.

## URL pública

`https://izc05.github.io/atelier-lumiere-demo/`
