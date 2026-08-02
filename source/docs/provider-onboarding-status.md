# Estados de incorporación del proveedor

Administración muestra una línea de progreso calculada a partir de PostgreSQL.

- `INVITED`: existe una invitación, pero todavía no hay cuenta.
- `ACCOUNT_CREATED`: la invitación se aceptó y existe usuario, pero falta verificar el correo.
- `EMAIL_VERIFIED`: el correo está verificado y falta configurar doble factor.
- `TWO_FACTOR_ENABLED`: el doble factor está activo, pero la membresía aún no está operativa.
- `PENDING_APPROVAL`: cuenta, correo, doble factor y membresía están listos; falta que Administración active el taller.
- `ACTIVE`: el taller está aprobado y puede iniciar sesión.
- `SUSPENDED`: el taller está pausado y su acceso queda bloqueado.

Los pasos visibles son: invitación, cuenta, correo, 2FA y aprobación. El navegador solo representa los valores devueltos por la API; no calcula estados de seguridad por su cuenta.
