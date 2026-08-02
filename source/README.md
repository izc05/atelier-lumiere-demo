# Código fuente de Atelier Lumière

Esta carpeta contiene la base ejecutable de la aplicación real. Permanece separada de la exportación pública de GitHub Pages para desarrollar y probar sin romper la demo actual.

## Estructura

```text
source/
├── apps/
│   ├── web/       # Interfaz fuente y comprobación de servicios
│   └── api/       # API privada y rutas técnicas
├── packages/
│   ├── database/  # Mapa de datos y futuro esquema PostgreSQL
│   ├── auth/      # Invitaciones, roles y doble factor
│   ├── storage/   # Políticas de imágenes y vídeos
│   └── shared/    # Estados y permisos compartidos
├── infra/
│   └── docker/    # Web, API y PostgreSQL para el mini PC
├── scripts/       # Validaciones de seguridad y estructura
├── tests/         # Pruebas de aislamiento y contratos
└── .env.example
```

## Ejecutar sin Docker

Se necesita Node.js 22 o posterior.

```bash
cd source
npm test
npm run dev:api
```

En otra terminal:

```bash
cd source
npm run dev:web
```

- Web fuente: `http://localhost:3000`
- Salud de API: `http://localhost:4000/health`
- Metadatos técnicos: `http://localhost:4000/api/meta`

## Ejecutar con Docker

```bash
cd source
cp .env.example .env
# Cambiar todas las contraseñas y secretos del archivo .env
docker compose -f infra/docker/docker-compose.yml up --build
```

El archivo `.env` nunca debe subirse a GitHub.

## Estado actual

El runtime ya puede arrancar, validar la comunicación Web/API y ejecutar pruebas automáticas. PostgreSQL está incluido en Docker, pero todavía no se utiliza desde la API. La autenticación, el almacenamiento y el aislamiento persistente siguen declarados como desactivados hasta implementarlos y probarlos en el Bloque 1.

## Reglas permanentes

- Un proveedor solo puede acceder a datos de su taller.
- Administración controla altas, pausas, revisiones y publicaciones.
- Las imágenes y vídeos no se almacenan en GitHub.
- Toda mutación futura deberá generar auditoría.
- La demo pública continúa funcionando durante el desarrollo.
- La aplicación real no sustituirá a la demo hasta reproducir el diseño y superar pruebas funcionales.
