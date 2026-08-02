import { randomUUID } from "node:crypto";
import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ZERO_CHECKSUM = "0".repeat(64);

function uuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function providerContext(context) {
  if (
    !context
    || !UUID_PATTERN.test(context.userId ?? "")
    || !UUID_PATTERN.test(context.providerId ?? "")
    || !["PROVIDER_OWNER", "PROVIDER_MEMBER"].includes(context.role)
  ) {
    throw new ServiceError("UNAUTHORIZED", "La sesión del proveedor no es válida.", 401);
  }
  return {
    userId: context.userId.toLowerCase(),
    providerId: context.providerId.toLowerCase(),
    role: context.role
  };
}

function mimeType(value) {
  const normalized = typeof value === "string"
    ? value.split(";", 1)[0].trim().toLowerCase()
    : "";
  if (!ALLOWED_MIME_TYPES.has(normalized)) {
    throw new ServiceError(
      "MEDIA_TYPE_NOT_ALLOWED",
      "Solo se admiten imágenes JPEG, PNG o WebP y vídeo MP4.",
      415
    );
  }
  return normalized;
}

function originalFilename(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(typeof value === "string" ? value : "");
  } catch {
    throw new ServiceError("MEDIA_FILENAME_INVALID", "El nombre del archivo no es válido.", 422);
  }
  const normalized = decoded
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .trim();
  if (!normalized || normalized.length > 240) {
    throw new ServiceError("MEDIA_FILENAME_INVALID", "El nombre del archivo no es válido.", 422);
  }
  return normalized;
}

function altText(value, { nullable = false } = {}) {
  if (value === undefined && nullable) return null;
  if (value === undefined || value === null || value === "") return "";
  let decoded;
  try {
    decoded = decodeURIComponent(String(value));
  } catch {
    throw new ServiceError("VALIDATION_ERROR", "El texto alternativo no es válido.", 422);
  }
  const normalized = decoded.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (normalized.length > 240) {
    throw new ServiceError("VALIDATION_ERROR", "El texto alternativo no es válido.", 422);
  }
  return normalized;
}

function contentLength(value, selectedMimeType) {
  const raw = String(value ?? "").trim();
  const parsed = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  const maximum = selectedMimeType === "video/mp4" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ServiceError(
      "MEDIA_SIZE_INVALID",
      selectedMimeType === "video/mp4"
        ? "El vídeo debe ocupar como máximo 50 MB."
        : "Cada imagen debe ocupar como máximo 12 MB.",
      413,
      { maximumBytes: maximum }
    );
  }
  return parsed;
}

function kindForMimeType(value) {
  return value === "video/mp4" ? "VIDEO" : "IMAGE";
}

function translateDatabaseError(error) {
  if (error instanceof ServiceError) return error;
  const message = String(error?.message ?? "");
  if (error?.code === "42501") {
    return new ServiceError(
      "PRODUCT_LOCKED",
      "Los archivos solo se pueden modificar mientras el artículo sea editable.",
      409
    );
  }
  if (error?.code === "23514") {
    if (message.includes("PRODUCT_IMAGE_LIMIT_EXCEEDED")) {
      return new ServiceError("MEDIA_LIMIT_REACHED", "El artículo ya tiene ocho imágenes.", 409, {
        kind: "IMAGE",
        maximum: 8
      });
    }
    if (message.includes("PRODUCT_VIDEO_LIMIT_EXCEEDED")) {
      return new ServiceError("MEDIA_LIMIT_REACHED", "El artículo ya tiene un vídeo.", 409, {
        kind: "VIDEO",
        maximum: 1
      });
    }
    return new ServiceError("MEDIA_VALIDATION_FAILED", "El archivo no cumple las reglas del catálogo.", 422);
  }
  return error;
}

function notFound() {
  return new ServiceError("MEDIA_NOT_FOUND", "No se ha encontrado el archivo.", 404);
}

function previewNotFound() {
  return new ServiceError(
    "MEDIA_PREVIEW_NOT_AVAILABLE",
    "La previsualización de este archivo no está disponible.",
    404
  );
}

function serializeMedia(row) {
  const ready = row.status === "READY";
  const hasPreview = ready && Boolean(row.preview_storage_key);
  return {
    id: row.id,
    productId: row.product_id,
    kind: row.kind,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    sizeBytes: Number(row.size_bytes),
    checksumSha256: ready ? row.checksum_sha256 : null,
    status: row.status,
    sortOrder: row.sort_order,
    altText: row.alt_text,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    rejectionReason: row.rejection_reason,
    readyAt: row.ready_at,
    createdAt: row.created_at,
    contentPath: ready
      ? `/api/provider/products/${row.product_id}/media/${row.id}/content`
      : null,
    previewPath: hasPreview
      ? `/api/provider/products/${row.product_id}/media/${row.id}/preview`
      : null,
    preview: hasPreview
      ? {
          mimeType: row.preview_mime_type,
          sizeBytes: Number(row.preview_size_bytes),
          width: row.preview_width,
          height: row.preview_height
        }
      : null
  };
}

async function audit(transaction, context, action, mediaId, productId, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'product_media', $4, $5::jsonb)`,
    [
      context.userId,
      context.providerId,
      action,
      mediaId,
      JSON.stringify({ productId, ...metadata })
    ]
  );
}

async function setUploadContext(transaction, mediaId) {
  await transaction.query("SELECT set_config('app.media_upload_id', $1, true)", [mediaId]);
}

export function createProductMediaService({
  database,
  storage,
  uploadTtlMinutes = Number.parseInt(process.env.MEDIA_UPLOAD_TTL_MINUTES ?? "15", 10),
  now = () => new Date(),
  logger = console
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createProductMediaService necesita una base de datos.");
  }
  if (
    !storage
    || typeof storage.write !== "function"
    || typeof storage.openRead !== "function"
    || typeof storage.openPreview !== "function"
  ) {
    throw new TypeError("createProductMediaService necesita almacenamiento privado con previews.");
  }
  if (!Number.isInteger(uploadTtlMinutes) || uploadTtlMinutes < 5 || uploadTtlMinutes > 60) {
    throw new TypeError("MEDIA_UPLOAD_TTL_MINUTES debe estar entre 5 y 60.");
  }

  async function rejectUpload(context, mediaId, reason, code) {
    try {
      await database.withContext(context, async (transaction) => {
        await setUploadContext(transaction, mediaId);
        const result = await transaction.query(
          `UPDATE product_media
           SET status = 'REJECTED',
               rejection_reason = $2,
               upload_expires_at = NULL
           WHERE id = $1 AND status = 'PENDING_UPLOAD'
           RETURNING product_id`,
          [mediaId, String(reason).slice(0, 1000)]
        );
        if (result.rowCount === 1) {
          await audit(
            transaction,
            context,
            "PRODUCT_MEDIA_REJECTED",
            mediaId,
            result.rows[0].product_id,
            { code }
          );
        }
      });
    } catch (error) {
      logger.error("No se ha podido registrar el rechazo de una carga.", {
        code: typeof error?.code === "string" ? error.code : "MEDIA_REJECTION_FAILED"
      });
    }
  }

  return Object.freeze({
    async upload(rawContext, rawProductId, metadata = {}, stream) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const selectedMimeType = mimeType(metadata.mimeType);
      const filename = originalFilename(metadata.originalFilename);
      const selectedAltText = altText(metadata.altText);
      const expectedBytes = contentLength(metadata.contentLength, selectedMimeType);
      const mediaId = randomUUID();
      const kind = kindForMimeType(selectedMimeType);
      const storageKey = storage.buildStorageKey({
        providerId: context.providerId,
        productId,
        mediaId,
        mimeType: selectedMimeType
      });
      const expiresAt = new Date(now().getTime() + uploadTtlMinutes * 60 * 1000);

      try {
        await database.withContext(context, async (transaction) => {
          const product = await transaction.query(
            "SELECT id FROM products WHERE id = $1",
            [productId]
          );
          if (product.rowCount !== 1) {
            throw new ServiceError("PRODUCT_NOT_FOUND", "No se ha encontrado el artículo.", 404);
          }
          await transaction.query(
            `INSERT INTO product_media (
               id, provider_id, product_id, kind, mime_type,
               original_filename, storage_key, size_bytes, checksum_sha256,
               status, alt_text, uploaded_by, upload_expires_at
             ) VALUES (
               $1, $2, $3, $4, $5,
               $6, $7, $8, $9,
               'PENDING_UPLOAD', $10, $11, $12
             )`,
            [
              mediaId,
              context.providerId,
              productId,
              kind,
              selectedMimeType,
              filename,
              storageKey,
              expectedBytes,
              ZERO_CHECKSUM,
              selectedAltText,
              context.userId,
              expiresAt
            ]
          );
          await audit(transaction, context, "PRODUCT_MEDIA_UPLOAD_RESERVED", mediaId, productId, {
            kind,
            expectedBytes,
            expiresAt
          });
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }

      try {
        const stored = await storage.write({
          stream,
          storageKey,
          expectedBytes,
          mimeType: selectedMimeType
        });

        return await database.withContext(context, async (transaction) => {
          await setUploadContext(transaction, mediaId);
          const result = await transaction.query(
            `UPDATE product_media
             SET status = 'READY',
                 size_bytes = $2,
                 checksum_sha256 = $3,
                 width = $4,
                 height = $5,
                 duration_seconds = $6,
                 preview_storage_key = $7,
                 preview_mime_type = $8,
                 preview_size_bytes = $9,
                 preview_checksum_sha256 = $10,
                 preview_width = $11,
                 preview_height = $12,
                 upload_expires_at = NULL
             WHERE id = $1 AND product_id = $13 AND status = 'PENDING_UPLOAD'
             RETURNING *`,
            [
              mediaId,
              stored.sizeBytes,
              stored.checksumSha256,
              stored.width,
              stored.height,
              stored.durationSeconds,
              stored.previewStorageKey,
              stored.previewMimeType,
              stored.previewSizeBytes,
              stored.previewChecksumSha256,
              stored.previewWidth,
              stored.previewHeight,
              productId
            ]
          );
          if (result.rowCount !== 1) throw notFound();
          await audit(transaction, context, "PRODUCT_MEDIA_UPLOADED", mediaId, productId, {
            kind,
            sizeBytes: stored.sizeBytes,
            checksumSha256: stored.checksumSha256,
            width: stored.width,
            height: stored.height,
            previewGenerated: Boolean(stored.previewStorageKey),
            previewSizeBytes: stored.previewSizeBytes
          });
          return serializeMedia(result.rows[0]);
        });
      } catch (error) {
        await storage.remove(storageKey).catch(() => {});
        await rejectUpload(
          context,
          mediaId,
          error instanceof ServiceError ? error.message : "La carga no se ha podido completar.",
          typeof error?.code === "string" ? error.code : "MEDIA_UPLOAD_FAILED"
        );
        if (error instanceof ServiceError) throw error;
        throw translateDatabaseError(error);
      }
    },

    async updateMetadata(rawContext, rawProductId, rawMediaId, input = {}) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const mediaId = uuid(rawMediaId, "mediaId");
      const selectedAltText = altText(input.altText, { nullable: true });
      const sortOrder = input.sortOrder === undefined ? null : Number(input.sortOrder);
      if (sortOrder !== null && (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000)) {
        throw new ServiceError("VALIDATION_ERROR", "El orden del archivo no es válido.", 422, {
          field: "sortOrder"
        });
      }
      if (selectedAltText === null && sortOrder === null) {
        throw new ServiceError("VALIDATION_ERROR", "No hay ningún cambio multimedia que guardar.", 422);
      }
      try {
        return await database.withContext(context, async (transaction) => {
          const result = await transaction.query(
            `UPDATE product_media
             SET alt_text = COALESCE($3, alt_text),
                 sort_order = COALESCE($4, sort_order)
             WHERE id = $1 AND product_id = $2 AND status <> 'DELETED'
             RETURNING *`,
            [mediaId, productId, selectedAltText, sortOrder]
          );
          if (result.rowCount !== 1) throw notFound();
          await audit(transaction, context, "PRODUCT_MEDIA_METADATA_UPDATED", mediaId, productId);
          return serializeMedia(result.rows[0]);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async remove(rawContext, rawProductId, rawMediaId) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const mediaId = uuid(rawMediaId, "mediaId");
      let storageKey;
      try {
        await database.withContext(context, async (transaction) => {
          const result = await transaction.query(
            `UPDATE product_media
             SET status = 'DELETED'
             WHERE id = $1 AND product_id = $2 AND status <> 'DELETED'
             RETURNING storage_key`,
            [mediaId, productId]
          );
          if (result.rowCount !== 1) throw notFound();
          storageKey = result.rows[0].storage_key;
          await audit(transaction, context, "PRODUCT_MEDIA_DELETED", mediaId, productId);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
      try {
        await storage.remove(storageKey);
      } catch (error) {
        logger.error("El registro multimedia se eliminó, pero el archivo necesita limpieza posterior.", {
          code: typeof error?.code === "string" ? error.code : "MEDIA_FILE_CLEANUP_FAILED"
        });
      }
      return { deleted: true, mediaId };
    },

    async open(rawContext, rawProductId, rawMediaId, variant = "content", rangeHeader) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const mediaId = uuid(rawMediaId, "mediaId");
      if (!["content", "preview"].includes(variant)) {
        throw new ServiceError("VALIDATION_ERROR", "La variante multimedia no es válida.", 422);
      }
      const row = await database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT id, product_id, mime_type, original_filename, storage_key, size_bytes,
                  preview_storage_key, preview_mime_type, preview_size_bytes
           FROM product_media
           WHERE id = $1 AND product_id = $2 AND status = 'READY'`,
          [mediaId, productId]
        );
        return result.rows[0] ?? null;
      });
      if (!row) throw notFound();

      if (variant === "preview") {
        if (!row.preview_storage_key) throw previewNotFound();
        const opened = await storage.openPreview(row.preview_storage_key, rangeHeader);
        return {
          ...opened,
          mimeType: row.preview_mime_type,
          originalFilename: `${row.original_filename.replace(/\.[^.]+$/, "")}-preview.webp`,
          mediaId: row.id,
          variant
        };
      }

      const opened = await storage.openRead(row.storage_key, rangeHeader);
      return {
        ...opened,
        mimeType: row.mime_type,
        originalFilename: row.original_filename,
        mediaId: row.id,
        variant
      };
    }
  });
}
