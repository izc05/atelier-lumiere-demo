# Atelier Lumière

Marketplace curado de artesanía para bodas, comuniones, bautizos, aniversarios y otras celebraciones.

## Estado actual

El repositorio contiene dos capas separadas:

1. **Demo pública protegida**, publicada mediante GitHub Pages como referencia visual.
2. **Aplicación real**, situada en `source/`, con web, API, PostgreSQL, autenticación, almacenamiento privado y operación del mini PC.

La aplicación real ya incluye:

- alta cerrada de talleres por invitación;
- cuentas administrativas reales con roles, contraseña, TOTP, recuperación y sesiones revocables;
- aislamiento entre talleres mediante Row Level Security forzada;
- catálogo, fotografías adaptativas, vídeo, revisión y publicación;
- blog editorial y escaparate público por taller;
- un único taller por checkout y envío compartido dentro del mismo taller;
- pedidos, encargos, presupuestos, conversaciones, archivos, logística e incidencias;
- área privada del cliente y resumen imprimible;
- avisos de pedido en cola, apagados hasta verificar SMTP;
- pago sandbox sin dinero real, disponible únicamente en modo piloto explícito;
- documentos legales versionados y centro de privacidad;
- migraciones verificadas, copias PostgreSQL y multimedia, recuperación y rollback;
- instalación, preflight, actualizaciones, supervisión y copias programadas para mini PC;
- navegación accesible, imágenes WebP adaptativas y páginas 404/500 definitivas.

## Situación de lanzamiento

Atelier Lumière **no está abierto a ventas reales**.

El repositorio está preparado para instalar un piloto privado. En el equipo real siguen pendientes:

- instalación en `/opt/atelier-lumiere`;
- creación presencial del primer `PLATFORM_OWNER`;
- dominio, HTTPS y Cloudflare Tunnel;
- configuración y comprobación del SMTP;
- disco o destino externo para duplicar copias;
- pruebas con dos talleres y datos autorizados.

Antes de cobrar dinero también deben definirse vendedor contractual, comisión, liquidaciones, facturación, fiscalidad, devoluciones y textos legales revisados profesionalmente.

## Desarrollo local

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
- Salud: `http://localhost:4000/health`

## Instalación en mini PC

No se debe copiar `.env.example` manualmente para una instalación real. Utilizar los asistentes:

```bash
cd /opt/atelier-lumiere/source
npm run init:mini-pc -- --app-url http://IP_DEL_MINI_PC:3000
npm run preflight:mini-pc -- --mode install
npm run deploy:mini-pc -- install
```

La creación del primer propietario requiere introducir personalmente la contraseña, escanear el QR y guardar los códigos de recuperación.

## Principios permanentes

- Los talleres solo acceden por invitación.
- El navegador nunca recibe credenciales internas de API.
- Un proveedor nunca consulta ni modifica otro taller.
- Un carrito contiene artículos de un único taller.
- Los importes se recalculan en el servidor.
- Fotografías, documentos, bases y secretos reales nunca se guardan en GitHub.
- Los pagos reales no se activan antes de cerrar el modelo jurídico y operativo.

## Tecnología

- Node.js 22, HTML, CSS y JavaScript.
- PostgreSQL 17 con RLS forzada.
- Docker Compose.
- Nodemailer, Sharp y QRCode.
- Almacenamiento privado en volumen persistente.
- GitHub Actions para aplicación, PostgreSQL, restauración y despliegue.
- Cloudflare Tunnel previsto para acceso externo.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Hoja de ruta](docs/ROADMAP.md)
- [Aplicación real](source/README.md)
- [Instalación del mini PC](source/docs/MINI_PC_INSTALL.md)
- [Operación del mini PC](source/docs/MINI_PC_OPERATOR.md)
- [Manual del piloto](source/docs/PILOT_RUNBOOK.md)
- [Base legal técnica](source/legal/README.md)
