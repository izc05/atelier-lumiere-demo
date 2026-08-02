# Web fuente de Atelier Lumière

La web fuente permanece separada de GitHub Pages. Su primera pantalla operativa es:

```text
/admin/proveedores/
```

## Activación para el piloto privado

El panel solo aparece cuando se configuran estas variables fuera del repositorio:

```env
ENABLE_ADMIN_UI=true
ALLOW_DEV_ADMIN_AUTH=true
DEV_ADMIN_TOKEN=<mismo token largo en web y API>
WEB_ADMIN_ACCESS_KEY=<clave privada para entrar desde el navegador>
```

`DEV_ADMIN_TOKEN` nunca se envía al navegador. La web lo utiliza únicamente en la red interna de Docker para comunicarse con la API.

## Sesión del navegador

- La clave se valida en el servidor web.
- Se genera un identificador aleatorio de sesión.
- La cookie es `HttpOnly` y `SameSite=Strict`.
- La sesión se guarda solo en memoria y desaparece al reiniciar el contenedor.
- El tiempo máximo predeterminado es de ocho horas.
- Cuando el acceso se publique por HTTPS debe configurarse `WEB_COOKIE_SECURE=true`.

## Funciones actuales

- Listar proveedores reales desde PostgreSQL.
- Crear proveedor e invitación.
- Pausar y reactivar.
- Renovar invitación y revocar la anterior.
- Consultar auditoría.
- Buscar por nombre, persona, correo o especialidad.

## Limitaciones deliberadas

- El envío de correos aún no está conectado.
- El enlace de activación se muestra como provisional.
- El proveedor todavía no puede crear su contraseña.
- La verificación del correo y el doble factor se implementarán antes del piloto con usuarios externos.
- Este acceso temporal queda inutilizado cuando la API se ejecuta con `NODE_ENV=production`.
