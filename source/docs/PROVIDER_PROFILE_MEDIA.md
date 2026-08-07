# Multimedia editorial del perfil del taller

Esta fase añade identidad visual versionada a los perfiles de taller sin permitir que un borrador modifique el escaparate público.

## Límites

- Logo: 1 imagen opcional.
- Portada: 1 imagen obligatoria para enviar una revisión.
- Galería: hasta 6 imágenes.
- Formatos: JPEG, PNG y WebP.
- Tamaño máximo: 12 MB por imagen.

## Flujo

1. El proveedor edita texto e imágenes en un borrador privado.
2. Al modificar una versión publicada, el perfil vuelve a `DRAFT`; el snapshot público anterior no cambia.
3. Para pasar a `IN_REVIEW` debe existir una portada `READY`.
4. Administración revisa texto, portada, logo y galería en `/admin/talleres/`.
5. Solo una revisión aprobada puede publicarse.
6. La publicación reconstruye de forma atómica `provider_profile_publications.snapshot`, incluyendo únicamente los archivos `READY` de la revisión.
7. El escaparate `/taller/` consume las referencias multimedia del snapshot publicado, nunca `provider_profile_media` directamente.

## Retención

Si el proveedor retira de un borrador una imagen que todavía está referenciada por la publicación vigente, el registro deja de formar parte del borrador pero el archivo físico se conserva para no romper la versión pública. Una imagen no referenciada puede eliminarse del almacenamiento privado.

## Seguridad

Los archivos originales permanecen en almacenamiento privado. Las cargas y previews privadas usan la sesión HttpOnly a través del BFF. El navegador no recibe tokens Bearer. Las imágenes públicas se resuelven por `provider slug + media id` contra el snapshot publicado actual.
