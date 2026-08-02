# Activación SMTP del piloto

El envío de correos permanece desactivado por defecto. La aplicación sigue permitiendo copiar enlaces manualmente mientras `SMTP_ENABLED=false`.

## Configuración mínima

1. Copiar `.env.example` como `.env` dentro del despliegue privado.
2. Configurar `APP_URL` con la dirección HTTPS pública del piloto.
3. Completar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` y `SMTP_REPLY_TO`.
4. Para puerto 587 utilizar `SMTP_SECURE=false` y `SMTP_REQUIRE_TLS=true`.
5. Para puerto 465 utilizar `SMTP_SECURE=true`.
6. Activar temporalmente `SMTP_VERIFY_ON_START=true` para comprobar conexión y autenticación al arrancar.
7. Cuando la verificación sea correcta, establecer `SMTP_ENABLED=true`.

## Comprobación

```bash
docker compose --env-file ../../.env up -d --build
docker compose logs --tail=100 api
```

El mensaje `SMTP verificado y preparado para correos transaccionales` confirma conexión, TLS y autenticación. La comprobación no garantiza que el proveedor acepte una dirección remitente concreta; eso se confirma con el primer envío real.

## Seguridad

- No introducir credenciales SMTP en GitHub ni en archivos públicos.
- Mantener `.env` fuera del repositorio.
- Usar una cuenta exclusiva para correos transaccionales.
- No desactivar la validación TLS.
- En producción los tokens nunca aparecen en las respuestas de la API.
- Si el correo falla, el alta permanece confirmada y Administración puede generar una invitación nueva.
