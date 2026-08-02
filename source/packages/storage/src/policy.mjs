export const MEDIA_POLICY = Object.freeze({
  maxImagesPerProduct: 8,
  maxImageBytes: 12 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  allowedImageTypes: Object.freeze(["image/jpeg", "image/png", "image/webp"]),
  allowedVideoTypes: Object.freeze(["video/mp4"])
});

export function validateProductMedia({ images = [], video = null }) {
  const errors = [];

  if (!Array.isArray(images)) {
    errors.push("La colección de imágenes no es válida.");
  } else {
    if (images.length > MEDIA_POLICY.maxImagesPerProduct) {
      errors.push(`Solo se permiten ${MEDIA_POLICY.maxImagesPerProduct} imágenes por artículo.`);
    }

    images.forEach((image, index) => {
      if (!MEDIA_POLICY.allowedImageTypes.includes(image.type)) {
        errors.push(`La imagen ${index + 1} tiene un formato no permitido.`);
      }
      if (!Number.isFinite(image.size) || image.size <= 0 || image.size > MEDIA_POLICY.maxImageBytes) {
        errors.push(`La imagen ${index + 1} supera el tamaño permitido o está vacía.`);
      }
    });
  }

  if (video) {
    if (!MEDIA_POLICY.allowedVideoTypes.includes(video.type)) {
      errors.push("El vídeo debe estar en formato MP4.");
    }
    if (!Number.isFinite(video.size) || video.size <= 0 || video.size > MEDIA_POLICY.maxVideoBytes) {
      errors.push("El vídeo supera el tamaño permitido o está vacío.");
    }
  }

  return { valid: errors.length === 0, errors };
}
