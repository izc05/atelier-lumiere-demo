# Base legal técnica · Atelier Lumière

Esta carpeta documenta la procedencia y los límites de los borradores legales del proyecto.

## Estado

Los documentos creados en el Bloque 7 son **borradores técnicos**. No constituyen asesoramiento jurídico ni deben marcarse como `PUBLISHED` mientras:

- existan marcadores pendientes;
- no se haya decidido el titular y el modelo contractual;
- no se hayan identificado vendedores, encargados, servicios externos y transferencias;
- no se hayan definido pagos, fiscalidad, comisiones, facturación y reembolsos;
- no se haya realizado una revisión profesional.

La base de datos impide publicar un documento mientras `professional_review_required` sea `true`.

## Fuentes oficiales consultadas

- Reglamento (UE) 2016/679 (RGPD): https://eur-lex.europa.eu/eli/reg/2016/679/oj/spa
- Ley Orgánica 3/2018 (LOPDGDD): https://www.boe.es/eli/es/lo/2018/12/05/3/con
- Ley 34/2002 (LSSI-CE): https://www.boe.es/eli/es/l/2002/07/11/34/con
- Ley General para la Defensa de los Consumidores y Usuarios: https://www.boe.es/eli/es/rdlg/2007/11/16/1/con
- Guías y criterios sobre cookies de la AEPD: https://www.aepd.es/guias-y-herramientas/guias

## Criterios técnicos aplicados

- Versiones y SHA-256 de cada documento.
- Una única versión publicada por tipo.
- Inmutabilidad del contenido una vez publicado.
- Borradores visibles en desarrollo y ocultos en producción.
- Categorías opcionales desactivadas por defecto.
- Aceptar y rechazar opcionales con la misma presencia visual.
- Clave de preferencias aleatoria, guardada en cookie técnica `HttpOnly`.
- Solo se almacena el hash de la clave en PostgreSQL.
- Historial de decisiones inmutable y sin IP ni huella del dispositivo.
- Ninguna herramienta de analítica, publicidad o marketing conectada en esta fase.

## Pendiente para la revisión profesional

- Titular, NIF, domicilio, registros y canales legales.
- Reparto de responsabilidades entre plataforma y talleres.
- Registro de actividades de tratamiento y plazos de conservación.
- Encargados, alojamiento, correo, copias de seguridad y transferencias.
- Textos de información por capas en formularios.
- Modelo de desistimiento, devoluciones y garantías.
- Acuerdo contractual de proveedores y licencia de contenido.
- Integración de los consentimientos con checkout y alta de proveedores.
