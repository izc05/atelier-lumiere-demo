# Atelier Lumière

Marketplace curado de artesanía para bodas, comuniones, bautizos, aniversarios y otras celebraciones.

## Estado actual

El repositorio contiene dos capas separadas:

1. **Demo pública protegida**, situada en la raíz y publicada mediante GitHub Pages. Conserva la referencia visual, la portada interactiva y distintos flujos demostrativos.
2. **Aplicación real mantenible**, situada en `source/`. Incluye web, API, PostgreSQL, autenticación, almacenamiento privado, catálogo, blog, pedidos, encargos y centro legal.

Los bloques técnicos 0–7 están integrados. La aplicación real ya dispone de:

- alta cerrada de proveedores mediante invitación;
- verificación de correo, contraseña, doble factor y recuperación de cuenta;
- aislamiento efectivo de cada taller mediante Row Level Security;
- catálogo privado, multimedia, revisión administrativa y publicación pública;
- blog editorial con revisión y publicación;
- pedidos separados por taller, encargos personalizados y conversaciones privadas;
- archivos privados, presupuestos, seguimiento e incidencias;
- checkout piloto sin cobro real;
- documentos legales versionados y centro de privacidad;
- pruebas automáticas de aplicación, PostgreSQL, seguridad y regresión de la demo.

## Límites actuales

Atelier Lumière **todavía no está abierto a ventas reales**.

Siguen pendientes:

- autenticación administrativa definitiva para producción;
- decisión jurídica y comercial sobre vendedor, comisiones, facturación y reparto de responsabilidades;
- decisión final entre compra limitada a un taller o checkout dividido por talleres;
- pasarela de pago en entorno de pruebas;
- estrategia de migraciones para bases de datos ya existentes;
- copias de seguridad y restauración verificadas;
- configuración del mini PC, correo real, HTTPS y Cloudflare Tunnel;
- revisión profesional de los textos legales;
- unificación visual de la aplicación real con la demo pública.

## Ejecutar la demo pública

La raíz utiliza Node.js 22 o posterior únicamente para validar la exportación protegida:

```bash
npm install
npm test
```

## Ejecutar la aplicación real

```bash
cd source
npm install
npm test
npm run dev:api
```

En otra terminal:

```bash
cd source
npm run dev:web
```

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Salud de la API: `http://localhost:4000/health`

También puede levantarse con Docker Compose:

```bash
cd source
cp .env.example .env
# Sustituir todos los secretos y contraseñas ficticios.
docker compose -f infra/docker/docker-compose.yml up --build
```

El archivo `.env` nunca debe subirse a GitHub.

## Principios del producto

- Los talleres acceden únicamente por invitación de Administración.
- No existe registro público de proveedores.
- Cada proveedor trabaja dentro de su propio espacio aislado.
- Los artículos y las historias pasan por revisión antes de publicarse.
- Fotografías, vídeos y archivos privados se guardan fuera de GitHub y PostgreSQL.
- Cada pieza puede incorporar historia, fotografías, vídeo y solicitud de diseño propio.
- La experiencia debe combinar curación editorial, confianza y personalización.
- Los pagos no se activarán hasta cerrar el modelo jurídico, comercial y operativo.

## Tecnología real

- Node.js 22 y módulos ECMAScript.
- HTML, CSS y JavaScript mantenibles.
- PostgreSQL 17 con Row Level Security forzada.
- Driver `pg` y consultas parametrizadas.
- Nodemailer para correo transaccional.
- Sharp para previews WebP.
- QRCode para configuración TOTP.
- Almacenamiento privado en volumen local del mini PC.
- Docker Compose para web, API, PostgreSQL y multimedia.
- GitHub Actions para pruebas y migraciones.
- Cloudflare Tunnel previsto para el piloto externo.

## Documentación

- [Arquitectura actual](docs/ARCHITECTURE.md)
- [Hoja de ruta](docs/ROADMAP.md)
- [Aplicación fuente](source/README.md)
- [Base legal técnica](source/legal/README.md)

## Seguridad del repositorio

Nunca deben almacenarse en GitHub:

- contraseñas o claves privadas;
- tokens y credenciales SMTP;
- archivos `.env` reales;
- datos personales de clientes o proveedores;
- copias de PostgreSQL;
- fotografías, vídeos o documentos reales de pedidos.
