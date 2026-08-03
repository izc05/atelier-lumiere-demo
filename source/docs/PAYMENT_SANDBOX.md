# Pago sandbox de Atelier Lumière

## Alcance

El sandbox valida el flujo técnico de pago sin conectarse a una entidad bancaria ni aceptar datos de tarjeta. Solo funciona fuera de producción y permanece desactivado por defecto.

Cada checkout pertenece a un único taller. Por ello, cada intento de pago se asocia a:

- un `checkout_batch`;
- un `provider_order`;
- un proveedor;
- un cliente;
- un importe y una moneda calculados por el servidor.

## Flujo

1. El checkout registra el pedido y reserva el stock.
2. Si `PAYMENT_SANDBOX_ENABLED=true`, se crea un intento de pago idempotente.
3. El navegador recibe únicamente una ruta con un token opaco.
4. La pantalla sandbox consulta el importe guardado por PostgreSQL.
5. El usuario puede simular un resultado aprobado o rechazado.
6. El servicio procesa ese resultado como un evento de pago.
7. Se actualizan el intento, la cronología del pedido y la auditoría.

## Webhooks

El endpoint técnico `/api/payment-sandbox/webhook` exige la cabecera `X-Atelier-Payment-Signature`, calculada con HMAC-SHA256 sobre el cuerpo JSON exacto.

La tabla `payment_webhook_events` conserva:

- proveedor del evento;
- identificador único;
- tipo de evento;
- huella SHA-256 del contenido;
- estado de procesamiento;
- referencia al intento de pago.

No conserva el cuerpo bruto. Un mismo identificador con la misma huella devuelve el resultado previo. El mismo identificador con contenido diferente produce `PAYMENT_WEBHOOK_IDEMPOTENCY_CONFLICT`.

## Estados

- `CREATED`: intento preparado.
- `PENDING`: reservado para una futura pasarela externa.
- `AUTHORIZED`: autorización recibida.
- `CAPTURED`: confirmación sandbox registrada.
- `FAILED`: resultado rechazado.
- `CANCELLED`: operación cancelada.
- `REFUNDED`: devolución registrada.
- `EXPIRED`: sesión caducada.

Ningún estado sandbox representa un movimiento de dinero real.

## Paso posterior

La integración de una pasarela real deberá implementar un adaptador que mantenga estas garantías:

- un proveedor por checkout;
- cálculo de importe exclusivamente en servidor;
- firma verificada antes de procesar webhooks;
- idempotencia por identificador y huella;
- cronología y auditoría sin datos sensibles;
- conciliación y reembolso ligados al intento de pago.
