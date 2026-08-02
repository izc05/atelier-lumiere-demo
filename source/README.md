# Código fuente de Atelier Lumière

Esta carpeta contendrá la aplicación real. Se mantiene separada de la exportación pública de GitHub Pages para poder desarrollar sin romper la demo actual.

## Estructura prevista

```text
source/
├── apps/
│   ├── web/       # Interfaz pública, administración y panel de proveedor
│   └── api/       # Autenticación, permisos, catálogo, pedidos y blog
├── packages/
│   ├── database/  # Esquema, migraciones y datos de prueba
│   ├── auth/      # Sesiones, roles, invitaciones y doble factor
│   ├── storage/   # Imágenes y vídeos
│   └── shared/    # Tipos y validaciones compartidas
├── infra/
│   ├── docker/    # Contenedores para el mini PC
│   └── backups/   # Scripts de copia y restauración
└── .env.example
```

## Estado

El Bloque 0 solo establece la separación y las reglas. El código ejecutable se añadirá progresivamente a partir del Bloque 1.

## Principios

- Un proveedor solo puede acceder a los datos de su taller.
- La administración controla altas, pausas, publicaciones y permisos.
- Las imágenes y vídeos no se almacenan en GitHub.
- La demo pública continúa funcionando durante todo el desarrollo.
- Antes de sustituir la demo, la aplicación real debe reproducir el diseño actual y superar todas las pruebas.
