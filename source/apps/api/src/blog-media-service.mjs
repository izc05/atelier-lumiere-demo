import { randomUUID } from "node:crypto";
import { extensionForMimeType } from "./media-storage-service.mjs";
import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PLACEMENTS = new Set(["COVER", "INLINE"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
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
      "BLOG_MEDIA_TYPE_NOT_ALLOWED",
      "Solo se admiten imágenes JPEG, PNG o WebP.",
      415
    );
  }
  return normalized;
}

function placement(value, { nullable = false } = {}) {
  if ((value === undefined || value === null || value === "") && nullable) return null;
  const normalized = String(value ?? "INLINE").trim().toUpperCase();
  if (!PLACEMENTS.has(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", "La posición de la imagen no es válida.", 422, {
      field: "placement"
    });
  }
  return normalized;
}

function originalFilename(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(typeof value === "string" ? value : "");
  } catch {
    throw new ServiceError("BLOG_MEDIA_FILENAME_INVALID", "El nombre del archivo no es válido.", 422);
  }
  const normalized = decoded
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .trim();
  if (!normalized || normalized.length > 240) {
    throw new ServiceError("BLOG_MEDIA_FILENAME_INVALID", "El nombre del archivo no es válido.", 422);
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

function contentLength(value) {
  const raw = String(value ?? "").trim();
  const parsed = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_IMAGE_BYTES) {
    throw new ServiceError(
      "BLOG_MEDIA_SIZE_INVALID",
      "Cada imagen del blog debe ocupar como máximo 12 MB.",
      413,
      { maximumBytes: MAX_IMAGE_BYTES }
    );
  }
  return parsed;
}

function storageKey({ providerId, postId, mediaId, selectedMimeType }) {
  const extension = extensionForMimeType(selectedMimeType);
  return `providers/${providerId}/blog/${postId}/${mediaId}/original.${extension}`;
}

function translateDatabaseError(error) {
  if (error instanceof ServiceError) return error;
  const message = String(error?.message ?? "");
  if (error?.code === "42501") {
    return new ServiceError(
      "BLOG_POST_LOCKED",
      "Las imágenes solo se pueden modificar mientras la publicación sea editable.",
      409
    );
  }
  if (error?.code === "23505") {
    if (error.constraint === "blog_post_one_cover_idx") {
      return new ServiceError(
        "BLOG_COVER_ALREADY_EXISTS",
        "La publicación ya tiene una portada. Retírala o conviértela en imagen interior.",
        409
      );
    }
    return new ServiceError("BLOG_MEDIA_CONFLICT", "La imagen ya existe.", 409);
  }
  if (error?.code === "23514") {
    if (message.includes("BLOG_IMAGE_LIMIT_EXCEEDED")) {
      return new ServiceError(
        "BLOG_MEDIA_LIMIT_REACHED",
        "La publicación ya tiene doce imágenes.",
        409,
        { maximum: 12 }
      );
    }
    return new ServiceError(
      "BLOG_MEDIA_VALIDATION_FAILED",
      "La imagen no cumple las reglas del blog.",
      422
    );
  }
  return error;
}

function notFound() {
  return new ServiceError("BLOG_MEDIA_NOT_FOUND", "No se ha encontrado la imagen.", 404);
}

function previewNotFound() {
  return new ServiceError(
    "BLOG_MEDIA_PREVIEW_NOT_AVAILABLE",
    "La previsualización de esta imagen no está disponible.",
    404
  );
}

function serialize(row) {
  const ready = row.status === "READY";
  const hasPreview = ready && Boolean(row.preview_storage_key);
  return {
    id: row.id,
    postId: row.post_id,
    placement: row.placement,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    sizeBytes: Number(row.size_bytes),
    checksumSha256: ready ? row.checksum_sha256 : null,
    status: row.status,
    sortOrder: row.sort_order,
    altText: row.alt_text,
    width: row.width,
    height: row.height,
    rejectionReason: row.rejection_reason,
    readyAt: row.ready_at,
    createdAt: row.created_at,
    contentPath: ready
      ? `/api/provider/blog-posts/${row.post_id}/media/${row.id}/content`
      : null,
    previewPath: hasPreview
      ? `/api/provider/blog-posts/${row.post_id}/media/${row.id}/preview`
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

async function audit(transaction, context, action, mediaId, postId, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'blog_media', $4, $5::jsonb)`,
    [
      context.userId,
      context.providerId,
      action,
      mediaId,
      JSON.stringify({ postId, ...metadata })
    ]
  );
}

async function setUploadContext(transaction, mediaId) {
  await transaction.query("SELECT set_config('app.blog_media_upload_id', $1, true)", [mediaId]);
}

export function createBlogMediaService({
  database,
  storage,
  uploadTtlMinutes = Number.parseInt(process.env.MEDIA_UPLOAD_TTL_MINUTES ?? "15", 10),
  now = () => new Date(),
  logger = console
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createBlogMediaService necesita una base de datos.");
  }
  if (
    !storage
    || typeof storage.write !== "function"
    || typeof storage.openRead !== "function"
    || typeof storage.openPreview !== "function"
    || typeof storage.remove !== "function"
  ) {
    throw new TypeError("createBlogMediaService necesita almacenamiento privado con previews.");
  }
  if (!Number.isInteger(uploadTtlMinutes) || uploadTtlMinutes < 5 || uploadTtlMinutes > 60) {
    throw new TypeError("MEDIA_UPLOAD_TTL_MINUTES debe estar entre 5 y 60.");
  }

  async function rejectUpload(context, mediaId, reason, code) {
    try {
      await database.withContext(context, async (transaction) => {
        await setUploadContext(transaction, mediaId);
        const result = await transaction.query(
          `UPDATE blog_post_media
           SET status = 'REJECTED',
               rejection_reason = $2,
               upload_expires_at = NULL
           WHERE id = $1 AND status = 'PENDING_UPLOAD'
           RETURNING post_id`,
          [mediaId, String(reason).slice(0, 1000)]
        );
        if (result.rowCount === 1) {
          await audit(transaction, context, "BLOG_MEDIA_REJECTED", mediaId, result.rows[0].post_id, {
            code
          });
        }
      });
    } catch (error) {
      logger.error("No se ha podido registrar el rechazo de una imagen del blog.", {
        code: typeof error?.code === "string" ? error.code : "BLOG_MEDIA_REJECTION_FAILED"
      });
    }
  }

  return Object.freeze({
    async upload(rawContext, rawPostId, metadata = {}, stream) {
      const context = providerContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      const selectedMimeType = mimeType(metadata.mimeType);
      const filename = originalFilename(metadata.originalFilename);
      const selectedAltText = altText(metadata.altText);
      const selectedPlacement = placement(metadata.placement);
      const expectedBytes = contentLength(metadata.contentLength);
      const mediaId = randomUUID();
      const selectedStorageKey = storageKey({
        providerId: context.providerId,
        postId,
        mediaId,
        selectedMimeType
      });
      const expiresAt = new Date(now().getTime() + uploadTtlMinutes * 60 * 1000);

      try {
        await database.withContext(context, async (transaction) => {
          const post = await transaction.query("SELECT id FROM blog_posts WHERE id = $1", [postId]);
          if (post.rowCount !== 1) {
            throw new ServiceError("BLOG_POST_NOT_FOUND", "No se ha encontrado la publicación.", 404);
          }
          await transaction.query(
            `INSERT INTO blog_post_media (
               id, provider_id, post_id, placement, mime_type,
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
              postId,
              selectedPlacement,
              selectedMimeType,
              filename,
              selectedStorageKey,
              expectedBytes,
              ZERO_CHECKSUM,
              selectedAltText,
              context.userId,
              expiresAt
            ]
          );
          await audit(transaction, context, "BLOG_MEDIA_UPLOAD_RESERVED", mediaId, postId, {
            placement: selectedPlacement,
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
          storageKey: selectedStorageKey,
          expectedBytes,
          mimeType: selectedMimeType
        });

        return await database.withContext(context, async (transaction) => {
          await setUploadContext(transaction, mediaId);
          const result = await transaction.query(
            `UPDATE blog_post_media
             SET status = 'READY',
                 size_bytes = $2,
                 checksum_sha256 = $3,
                 width = $4,
                 height = $5,
                 preview_storage_key = $6,
                 preview_mime_type = $7,
                 preview_size_bytes = $8,
                 preview_checksum_sha256 = $9,
                 preview_width = $10,
                 preview_height = $11,
                 upload_expires_at = NULL
             WHERE id = $1 AND post_id = $12 AND status = 'PENDING_UPLOAD'
             RETURNING *`,
            [
              mediaId,
              stored.sizeBytes,
              stored.checksumSha256,
              stored.width,
              stored.height,
              stored.previewStorageKey,
              stored.previewMimeType,
              stored.previewSizeBytes,
              stored.previewChecksumSha256,
              stored.previewWidth,
              stored.previewHeight,
              postId
            ]
          );
          if (result.rowCount !== 1) throw notFound();
          await audit(transaction, context, "BLOG_MEDIA_UPLOADED", mediaId, postId, {
            placement: selectedPlacement,
            sizeBytes: stored.sizeBytes,
            checksumSha256: stored.checksumSha256,
            width: stored.width,
            height: stored.height,
            previewGenerated: Boolean(stored.previewStorageKey),
            previewSizeBytes: stored.previewSizeBytes
          });
          return serialize(result.rows[0]);
        });
      } catch (error) {
        await storage.remove(selectedStorageKey).catch(() => {});
        await rejectUpload(
          context,
          mediaId,
          error instanceof ServiceError ? error.message : "La carga no se ha podido completar.",
          typeof error?.code === "string" ? error.code : "BLOG_MEDIA_UPLOAD_FAILED"
        );
        if (error instanceof ServiceError) throw error;
        throw translateDatabaseError(error);
      }
    },

    async updateMetadata(rawContext, rawPostId, rawMediaId, input = {}) {
      const context = providerContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      const mediaId = uuid(rawMediaId, "mediaId");
      const selectedAltText = altText(input.altText, { nullable: true });
      const selectedPlacement = placement(input.placement, { nullable: true });
      const sortOrder = input.sortOrder === undefined ? null : Number(input.sortOrder);
      if (sortOrder !== null && (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000)) {
        throw new ServiceError("VALIDATION_ERROR", "El orden de la imagen no es válido.", 422, {
          field: "sortOrder"
        });
      }
      if (selectedAltText === null && selectedPlacement === null && sortOrder === null) {
        throw new ServiceError("VALIDATION_ERROR", "No hay ningún cambio multimedia que guardar.", 422);
      }
      try {
        return await database.withContext(context, async (transaction) => {
          const result = await transaction.query(
            `UPDATE blog_post_media
             SET alt_text = COALESCE($3, alt_text),
                 placement = COALESCE($4, placement),
                 sort_order = COALESCE($5, sort_order)
             WHERE id = $1 AND post_id = $2 AND status <> 'DELETED'
             RETURNING *`,
            [mediaId, postId, selectedAltText, selectedPlacement, sortOrder]
          );
          if (result.rowCount !== 1) throw notFound();
          await audit(transaction, context, "BLOG_MEDIA_METADATA_UPDATED", mediaId, postId, {
            placement: result.rows[0].placement,
            sortOrder: result.rows[0].sort_order
          });
          return serialize(result.rows[0]);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async remove(rawContext, rawPostId, rawMediaId) {
      const context = providerContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      const mediaId = uuid(rawMediaId, "mediaId");
      let selectedStorageKey;
      try {
        await database.withContext(context, async (transaction) => {
          await setUploadContext(transaction, mediaId);
          const result = await transaction.query(
            `UPDATE blog_post_media
             SET status = 'DELETED', upload_expires_at = NULL
             WHERE id = $1 AND post_id = $2 AND status IN ('READY', 'REJECTED')
             RETURNING storage_key`,
            [mediaId, postId]
          );
          if (result.rowCount !== 1) throw notFound();
          selectedStorageKey = result.rows[0].storage_key;
          await audit(transaction, context, "BLOG_MEDIA_DELETED", mediaId, postId);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
      try {
        await storage.remove(selectedStorageKey);
      } catch (error) {
        logger.error("La imagen se retiró, pero el archivo necesita limpieza posterior.", {
          code: typeof error?.code === "string" ? error.code : "BLOG_MEDIA_FILE_CLEANUP_FAILED"
        });
      }
      return { deleted: true, mediaId };
    },

    async open(rawContext, rawPostId, rawMediaId, variant = "content", rangeHeader) {
      const context = providerContext(rawContext);
      const postId = uuid(rawPostId, "postId");
      const mediaId = uuid(rawMediaId, "mediaId");
      if (!["content", "preview"].includes(variant)) {
        throw new ServiceError("VALIDATION_ERROR", "La variante multimedia no es válida.", 422);
      }
      const row = await database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT id, post_id, mime_type, original_filename, storage_key, size_bytes,
                  preview_storage_key, preview_mime_type, preview_size_bytes
           FROM blog_post_media
           WHERE id = $1 AND post_id = $2 AND status = 'READY'`,
          [mediaId, postId]
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
