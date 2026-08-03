# Base legal técnica · Atelier Lumière

Esta carpeta documenta la procedencia y los límites de los borradores legales del proyecto.

## Estado

Los documentos creados en el Bloque 7 son **borradores técnicos**. No constituyen asesoramiento jurídico ni deben cambiar de `DRAFT` a `ACTIVE` mientras:

- existan marcadores pendientes;
- no se haya decidido el titular y el modelo contractual;
- no se hayan identificado vendedores, encargados, servicios externos y transferencias;
- no se hayan definido pagos, fiscalidad, comisiones, facturación y reembolsos;
- no se haya realizado una revisión profesional.

La base de datos exige `review_status = 'PROFESSIONAL_REVIEWED'`, junto con revisor y fecha, antes de activar un documento. Una vez activo, su versión, título, resumen, contenido, hash y datos de revisión quedan bloqueados. Solo puede pasar a `RETIRED`, y un documento retirado tampoco puede modificarse.

## Fuentes oficiales consultadas

- Reglamento (UE) 2016/679 (RGPD): https://eur-lex.europa.eu/eli/reg/2016/679/oj/spa
- Ley Orgánica 3/2018 (LOPDGDD): https://www.boe.es/eli/es/lo/2018/12/05/3/con
- Ley 34/2002 (LSSI-CE): https://www.boe.es/eli/es/l/2002/07/11/34/con
- Ley General para la Defensa de los Consumidores y Usuarios: https://www.boe.es/eli/es/rdlg/2007/11/16/1/con
- Guías y criterios sobre cookies de la AEPD: https://www.aepd.es/guias-y-herramientas/guias

## Criterios técnicos aplicados

- Versiones semánticas y SHA-256 de cada documento.
- Una única versión activa por tipo e idioma.
- Revisión profesional obligatoria antes de activar.
- Inmutabilidad de documentos activos y retirados.
- Borradores visibles en desarrollo y ocultos en producción.
- Copia exacta de las condiciones aceptadas en cada checkout.
- Categorías opcionales desactivadas por defecto.
- Aceptar y rechazar opcionales con la misma presencia visual.
- Clave de preferencias aleatoria, guardada en cookie técnica `HttpOnly`.
- Solo se almacena el hash de la clave en PostgreSQL.
- Historial de decisiones append-only.
- El centro de privacidad no registra IP, agente del dispositivo ni huella.
- Ninguna herramienta de analítica, publicidad o marketing conectada en esta fase.

## Pendiente para la revisión profesional

- Titular, NIF, domicilio, registros y canales legales.
- Reparto de responsabilidades entre plataforma y talleres.
- Registro de actividades de tratamiento y plazos de conservación.
- Encargados, alojamiento, correo, copias de seguridad y transferencias.
- Textos de información por capas en formularios.
- Modelo de desistimiento, devoluciones y garantías.
- Acuerdo contractual de proveedores y licencia de contenido.
- Integración definitiva de consentimientos con checkout y alta de proveedores.
