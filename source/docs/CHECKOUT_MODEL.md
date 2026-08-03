# Modelo de checkout de Atelier Lumière

## Decisión vigente

Cada checkout, pedido y futuro pago pertenece a un único taller proveedor.

El cliente puede añadir varias piezas del mismo taller, combinarlas en un único pedido y compartir el coste de envío definido para ese proveedor. Para comprar a otro taller debe finalizar el pedido actual o vaciar el carrito y comenzar otro.

## Motivo

Este modelo reduce la complejidad y el riesgo del piloto:

- un único vendedor por pedido;
- un único envío y seguimiento;
- una única factura o justificante comercial;
- devoluciones y reembolsos asociados a un solo taller;
- conciliación de pago más sencilla;
- menor ambigüedad legal y fiscal;
- no requiere repartir un cobro entre varios proveedores.

## Protecciones técnicas

La regla se aplica en dos niveles:

1. El carrito del navegador rechaza artículos de un taller distinto al que ya contiene.
2. PostgreSQL impide que un mismo `checkout_id` tenga pedidos con más de un `provider_id`.

La segunda protección es la autoridad final. Aunque alguien manipule el navegador o llame directamente a la API, la transacción completa se revierte y no se crean pedidos parciales ni reservas de stock.

## Experiencia del cliente

- Puede comprar varias unidades y artículos del mismo taller.
- Puede añadir personalizaciones y solicitudes de diseño propio.
- Ve claramente qué taller prepara el pedido.
- El envío se calcula una sola vez para ese taller.
- Tras finalizar puede iniciar otra compra con otro proveedor.

## Pagos futuros

La pasarela de pago deberá crear un intento de pago por pedido y por proveedor. No se implementará un pago único que deba dividirse entre talleres.

Antes de activar pagos reales siguen siendo necesarias las decisiones contractuales, fiscales y de facturación, además de la revisión jurídica profesional de los textos legales.
