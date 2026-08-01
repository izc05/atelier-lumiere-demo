# Lumiere

Marketplace curado de artesanía para bodas, comuniones y celebraciones.

## Estado

La primera versión ejecutable ya está disponible. Incluye Inicio, Tienda con filtros, fichas de producto, carrito separado por proveedor, Blog, cuenta de demostración, solicitudes personalizadas y un panel de administración navegable. El panel permite gestionar proveedores cerrados; crear, editar y publicar artículos; controlar pedidos separados por taller y envío; y tramitar encargos personalizados desde la solicitud hasta la elaboración. Los cambios son temporales y no envían correos reales; la conexión a PostgreSQL, autenticación y Bizum/Redsys corresponde a la siguiente fase.

## Ejecutar en local

Requiere Node.js 24.

```bash
npm install
npm run dev
```

Comprobaciones antes de publicar cambios:

```bash
npm run lint
npm run typecheck
npm run build
```

Para generar la demostración estática publicada en GitHub Pages:

```bash
npm run build:pages
```

## Principios del producto

- Catálogo público con artículos de proveedores invitados por administración.
- No existe registro público de proveedores.
- Cada carrito, pedido, pago y envío pertenece a un único proveedor.
- El cliente puede comprar varios artículos del mismo proveedor y compartir el envío.
- Cada artículo puede incluir historia, fotografías, vídeo y solicitud de diseño personalizado.
- La portada tendrá movimiento elegante, vídeo y efectos de desplazamiento, respetando rendimiento y accesibilidad.
- Administrador, proveedor y cliente tienen permisos claramente separados.

## Tecnología acordada

- TypeScript.
- Next.js 16 y React.
- PostgreSQL 18 y Prisma ORM.
- Better Auth para autenticación y doble factor.
- Tailwind CSS y Motion para el sistema visual.
- MinIO/S3 para imágenes y vídeos.
- FFmpeg para optimización de vídeo.
- Bizum mediante integración segura por redirección.
- Docker Compose en el mini PC.
- Cloudflare Tunnel para la publicación sin abrir puertos del router.

## Documentación

- [Arquitectura](docs/ARQUITECTURA.md)
- [Seguridad](docs/SEGURIDAD.md)
- [Flujos funcionales](docs/FLUJOS.md)
- [Decisiones](docs/DECISIONES.md)
- [Hoja de ruta](docs/ROADMAP.md)
- [Referencia visual](docs/design/README.md)
- [Informe de calidad visual](design-qa.md)

## Repositorio

Las claves, datos personales, copias de la base de datos y archivos reales de clientes o proveedores nunca se almacenarán en GitHub.
