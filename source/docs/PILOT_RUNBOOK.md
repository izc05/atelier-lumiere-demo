# Manual operativo del piloto privado

Este manual define cuándo Atelier Lumière está preparado para probarse con talleres y pedidos ficticios. El piloto no acepta dinero real.

## Estados

- **REPOSITORIO PREPARADO**: pruebas y validaciones de GitHub en verde.
- **MINI PC PREPARADO**: instalación saludable, propietario creado, HTTPS y copias activas.
- **PILOTO PREPARADO**: SMTP verificado, dos talleres de confianza y datos ficticios cargados.
- **VENTAS REALES**: no permitido hasta cerrar modelo contractual, revisión jurídica y pasarela real.

## Puerta de entrada

Ejecutar desde `/opt/atelier-lumiere/source`:

```bash
npm run preflight:mini-pc -- --mode check
npm run health:mini-pc
```

No continuar con pedidos si aparece un `ERROR`.

## Preparación inicial

1. Instalar mediante `npm run deploy:mini-pc -- install`.
2. Crear presencialmente el primer `PLATFORM_OWNER`.
3. Activar la interfaz administrativa.
4. Configurar Cloudflare Tunnel y una URL HTTPS.
5. Cambiar en `.env`:

```dotenv
APP_URL=https://subdominio.example.com
AUTH_TRUSTED_ORIGINS=https://subdominio.example.com
WEB_BIND_ADDRESS=127.0.0.1
WEB_COOKIE_SECURE=true
PROVIDER_COOKIE_SECURE=true
```

6. Configurar y probar el correo:

```bash
npm run configure:smtp
```

7. Confirmar que el mensaje llegó antes de activar avisos automáticos.
8. Instalar copias y comprobaciones programadas:

```bash
sudo npm run install:pilot-operations
```

9. Configurar `PILOT_BACKUP_MIRROR_DIR` con un disco o destino montado fuera del disco principal.
10. Ejecutar una copia completa manual:

```bash
npm run backup:pilot -- /opt/atelier-backups
```

## Activación controlada del piloto

Solo después de completar los pasos anteriores:

```dotenv
PILOT_MODE_ENABLED=true
PILOT_CHECKOUT_ENABLED=true
PAYMENT_SANDBOX_ENABLED=true
ORDER_EMAIL_NOTIFICATIONS_ENABLED=true
```

Recrear API y web y volver a ejecutar preflight y health.

El modo piloto:

- usa servicios técnicos separados, no una cuenta administrativa oculta;
- permite crear pedidos de un único taller;
- recalcula importes en servidor;
- descuenta exclusivamente stock publicado;
- permite aprobar o rechazar un pago ficticio;
- nunca representa dinero cobrado.

## Guion de prueba

Para cada uno de los dos talleres:

1. invitación, contraseña, correo y TOTP;
2. perfil y miembros;
3. cinco a diez productos con fotografías reales de prueba;
4. una historia editorial;
5. revisión y publicación;
6. pedido normal;
7. encargo personalizado y presupuesto;
8. pago sandbox aprobado;
9. pago sandbox rechazado;
10. aceptación, elaboración, envío y entrega;
11. mensaje, archivo e incidencia;
12. recuperación de contraseña y de 2FA;
13. revisión móvil y escritorio.

Usar correos y direcciones autorizados para el piloto. No cargar tarjetas, documentos de identidad ni datos de clientes reales.

## Condiciones de parada

Detener el piloto y no registrar nuevos pedidos cuando ocurra cualquiera de estos puntos:

- API, web o PostgreSQL no saludables;
- copia completa con más de 36 horas;
- destino externo de copias desconectado;
- menos de 10 GB libres;
- SMTP no entrega;
- HTTPS o cookies Secure desactivados;
- una prueba muestra datos de otro taller;
- restauración o migración pendiente de revisar.

## Cierre diario

```bash
npm run health:mini-pc
systemctl status atelier-pilot-backup.timer atelier-pilot-health.timer --no-pager
```

Las copias antiguas se eliminan según `PILOT_BACKUP_RETENTION_DAYS`, con 14 días por defecto. No borrar manualmente la última copia verificada ni los códigos de recuperación.
