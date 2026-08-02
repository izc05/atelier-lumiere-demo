# Arquitectura de Atelier Lumière

## Situación actual

La raíz del repositorio contiene la exportación pública que sirve GitHub Pages. Incluye la experiencia visual completa y varios flujos de demostración, pero gran parte de la aplicación está compilada en archivos de Next.js dentro de `_next/static/`.

La demo pública se considera una referencia visual protegida. No se utilizará como lugar principal para desarrollar backend, autenticación, base de datos o permisos.

## Dos capas separadas

### 1. Demo pública estable

Ubicación: raíz del repositorio.

Responsabilidad:

- Portada y entrada interactiva.
- Tienda y fichas de producto.
- Cuenta y carrito de demostración.
- Administración visual.
- Presentación de proveedores, artículos, pedidos y encargos ficticios.

Regla: cualquier cambio debe superar `npm test` antes de fusionarse en `main`.

### 2. Aplicación real mantenible

Ubicación prevista: `source/`.

Responsabilidad futura:

- Web con código fuente.
- API privada.
- Base de datos.
- Autenticación y doble factor.
- Permisos por proveedor.
- Almacenamiento multimedia.
- Correos de invitación.
- Blog editorial.
- Pedidos, pagos y facturación.
- Docker para el mini PC.

La aplicación real se construirá sin sustituir la demo pública hasta que reproduzca correctamente el diseño y supere las pruebas funcionales.

## Estrategia de ramas

- `main`: demo pública estable.
- `block-0-base-tecnica`: documentación y protecciones.
- Un bloque funcional por rama posterior.
- Cada rama se revisa mediante Pull Request.
- No se fusiona un bloque si rompe Inicio, Tienda, Cuenta, Carrito, Administración o la entrada interactiva.

## Datos y secretos

Nunca se guardarán en GitHub:

- Contraseñas.
- Claves privadas.
- Tokens.
- Credenciales de correo.
- Datos reales de proveedores o clientes.
- Copias de base de datos.

Los valores privados se configurarán en el mini PC mediante archivos `.env` excluidos del repositorio. Solo se versionará `.env.example` con nombres de variables y valores ficticios.

## Orden técnico

1. Protección de la demo y estructura fuente.
2. Base de datos, usuarios y roles.
3. Gestión real de proveedores.
4. Panel privado del proveedor.
5. Artículos, imágenes y vídeos.
6. Blog editorial.
7. Pedidos y encargos.
8. Legal y privacidad.
9. Pagos.
10. Despliegue privado en mini PC.
