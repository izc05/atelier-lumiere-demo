import { randomUUID } from "node:crypto";
import { extensionForMimeType } from "./media-storage-service.mjs";
import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_KINDS = new Set(["LOGO", "COVER", "GALLERY"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ZERO_CHECKSUM = "0".repeat(64);

function uuid(value, field = "mediaId") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function providerContext(context) {
  if (!context?.providerId || !context?.userId || !["PROVIDER_OWNER", "PROVIDER_MEMBER"].includes(context.role)) {
    throw new ServiceError("UNAUTHORIZED", "La sesión del proveedor no es válida.", 401);
  }
  return {
    role: context.role,
    userId: uuid(context.userId, "userId"),
    providerId: uuid(context.providerId, "providerId")
  };
}

function adminContext(context) {
  if (context?.role !== "ADMIN" || !context?.userId) {
    throw new ServiceError("FORBIDDEN", "La revisión multimedia requiere Administración.", 403);
  }
  return context;
}

function mimeType(value) {
  const normalized = typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";
  if (!ALLOWED_MIME_TYPES.has(normalized)) {
    throw new ServiceError("MEDIA_TYPE_NOT_ALLOWED", "Solo se admiten imágenes JPEG, PNG o WebP.", 415);
  }
  return normalized;
}

function mediaKind(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!ALLOWED_KINDS.has(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", "El tipo de imagen debe ser LOGO, COVER o GALLERY.", 422, { field: "kind" });
  }
  return normalized;
}

function galleryOrder(value) {
  if (!Array.isArray(value) || value.length > 6) {
    throw new ServiceError("VALIDATION_ERROR", "El orden de la galería debe contener como máximo seis fotografías.", 422, {
      field: "mediaIds"
    });
  }
  const normalized = value.map((item, index) => uuid(item, `mediaIds.${index}`));
  if (new Set(normalized).size !== normalized.length) {
    throw new ServiceError("VALIDATION_ERROR", "Una fotografía no puede aparecer dos veces en el orden de la galería.", 422, {
      field: "mediaIds"
    });
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
  const normalized = decoded.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "-").trim();
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

function contentLength(value) {
  const raw = String(value ?? "").trim();
  const parsed = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_IMAGE_BYTES) {
    throw new ServiceError("MEDIA_SIZE_INVALID", "Cada imagen debe ocupar como máximo 12 MB.", 413, {
      maximumBytes: MAX_IMAGE_BYTES
    });
  }
  return parsed;
}

function storageKey({ providerId, mediaId, selectedMimeType }) {
  const extension = extensionForMimeType(selectedMimeType);
  return `providers/${providerId}/profile/${mediaId}/original.${extension}`;
}

function translateDatabaseError(error) {
  if (error instanceof ServiceError) return error;
  const message = String(error?.message ?? "");
  if (error?.code === "42501") {
    return new ServiceError("PROFILE_LOCKED", "Las imágenes solo se pueden modificar mientras el perfil sea editable.", 409);
  }
  if (error?.code === "23514") {
    if (message.includes("PROVIDER_PROFILE_MEDIA_LIMIT_EXCEEDED")) {
      return new ServiceError("MEDIA_LIMIT_REACHED", "Ya se ha alcanzado el límite de imágenes para ese bloque.", 409);
    }
    return new ServiceError("MEDIA_VALIDATION_FAILED", "La imagen no cumple las reglas del perfil del taller.", 422);
  }
  return error;
}

function serializeMedia(row, { admin = false } = {}) {
  const ready = row.status === "READY";
  const prefix = admin
    ? `/api/admin/provider-profiles/${row.provider_id}/media/${row.id}`
    : `/api/provider/profile/media/${row.id}`;
  return {
    id: row.id,
    providerId: row.provider_id,
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
    rejectionReason: row.rejection_reason,
    readyAt: row.ready_at,
    createdAt: row.created_at,
    previewPath: ready && row.preview_storage_key ? `${prefix}/preview` : null,
    preview: ready && row.preview_storage_key ? {
      mimeType: row.preview_mime_type,
      sizeBytes: Number(row.preview_size_bytes),
      width: row.preview_width,
      height: row.preview_height
    } : null
  };
}

async function audit(transaction, context, providerId, action, mediaId, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'provider_profile_media', $4, $5::jsonb)`,
    [context.userId, providerId, action, mediaId, JSON.stringify(metadata)]
  );
}

async function makeProfileEditable(transaction, context) {
  const result = await transaction.query(
    "SELECT status FROM provider_profiles WHERE provider_id = $1",
    [context.providerId]
  );
  if (result.rowCount !== 1) {
    throw new ServiceError("PROVIDER_PROFILE_NOT_FOUND", "No se ha encontrado el perfil del taller.", 404);
  }
  const status = result.rows[0].status;
  if (["IN_REVIEW", "APPROVED"].includes(status)) {
    throw new ServiceError("PROFILE_LOCKED", "El perfil está bloqueado mientras Atelier Lumière lo revisa.", 409);
  }
  if (status === "PUBLISHED") {
    await transaction.query("UPDATE provider_profiles SET status = 'DRAFT' WHERE provider_id = $1", [context.providerId]);
  }
}

function notFound() {
  return new ServiceError("MEDIA_NOT_FOUND", "No se ha encontrado la imagen del perfil.", 404);
}

export function createProviderProfileMediaService({
  database,
  storage,
  uploadTtlMinutes = Number.parseInt(process.env.MEDIA_UPLOAD_TTL_MINUTES ?? "15", 10),
  now = () => new Date(),
  logger = console
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createProviderProfileMediaService necesita una base de datos.");
  }
  if (!storage || typeof storage.write !== "function" || typeof storage.openPreview !== "function") {
    throw new TypeError("createProviderProfileMediaService necesita almacenamiento privado con previews.");
  }
  if (!Number.isInteger(uploadTtlMinutes) || uploadTtlMinutes < 5 || uploadTtlMinutes > 60) {
    throw new TypeError("MEDIA_UPLOAD_TTL_MINUTES debe estar entre 5 y 60.");
  }

  async function rejectUpload(context, mediaId, reason, code) {
    try {
      await database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE provider_profile_media
           SET status = 'REJECTED', rejection_reason = $2, upload_expires_at = NULL
           WHERE id = $1 AND provider_id = $3 AND status = 'PENDING_UPLOAD'
           RETURNING id`,
          [mediaId, String(reason).slice(0, 1000), context.providerId]
        );
        if (result.rowCount === 1) {
          await audit(transaction, context, context.providerId, "PROVIDER_PROFILE_MEDIA_REJECTED", mediaId, { code });
        }
      });
    } catch (error) {
      logger.error("No se ha podido registrar el rechazo de una imagen del perfil.", {
        code: typeof error?.code === "string" ? error.code : "PROFILE_MEDIA_REJECTION_FAILED"
      });
    }
  }

  async function openRow(context, providerId, mediaId, admin) {
    return database.withContext(context, async (transaction) => {
      const result = await transaction.query(
        `SELECT * FROM provider_profile_media
         WHERE id = $1 AND provider_id = $2 AND status = 'READY'`,
        [mediaId, providerId]
      );
      if (result.rowCount !== 1) throw notFound();
      return { row: result.rows[0], admin };
    });
  }

  return Object.freeze({
    async list(rawContext) {
      const context = providerContext(rawContext);
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT * FROM provider_profile_media
           WHERE provider_id = $1 AND status NOT IN ('DELETED','REJECTED')
           ORDER BY CASE kind WHEN 'LOGO' THEN 0 WHEN 'COVER' THEN 1 ELSE 2 END, sort_order, created_at`,
          [context.providerId]
        );
        return result.rows.map((row) => serializeMedia(row));
      });
    },

    async listAdmin(rawContext, rawProviderId) {
      const context = adminContext(rawContext);
      const providerId = uuid(rawProviderId, "providerId");
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT * FROM provider_profile_media
           WHERE provider_id = $1 AND status = 'READY'
           ORDER BY CASE kind WHEN 'LOGO' THEN 0 WHEN 'COVER' THEN 1 ELSE 2 END, sort_order, created_at`,
          [providerId]
        );
        return result.rows.map((row) => serializeMedia(row, { admin: true }));
      });
    },

    async upload(rawContext, metadata = {}, stream) {
      const context = providerContext(rawContext);
      const selectedMimeType = mimeType(metadata.mimeType);
      const kind = mediaKind(metadata.kind);
      const filename = originalFilename(metadata.originalFilename);
      const selectedAltText = altText(metadata.altText);
      const expectedBytes = contentLength(metadata.contentLength);
      const mediaId = randomUUID();
      const key = storageKey({ providerId: context.providerId, mediaId, selectedMimeType });
      const expiresAt = new Date(now().getTime() + uploadTtlMinutes * 60 * 1000);

      try {
        await database.withContext(context, async (transaction) => {
          await makeProfileEditable(transaction, context);
          await transaction.query(
            `INSERT INTO provider_profile_media (
               id, provider_id, kind, mime_type, original_filename, storage_key,
               size_bytes, checksum_sha256, status, alt_text, uploaded_by, upload_expires_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING_UPLOAD',$9,$10,$11)`,
            [mediaId, context.providerId, kind, selectedMimeType, filename, key,
             expectedBytes, ZERO_CHECKSUM, selectedAltText, context.userId, expiresAt]
          );
          await audit(transaction, context, context.providerId, "PROVIDER_PROFILE_MEDIA_UPLOAD_RESERVED", mediaId, {
            kind, expectedBytes, expiresAt
          });
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }

      try {
        const stored = await storage.write({
          stream,
          storageKey: key,
          expectedBytes,
          mimeType: selectedMimeType
        });
        return await database.withContext(context, async (transaction) => {
          const result = await transaction.query(
            `UPDATE provider_profile_media
             SET status = 'READY', size_bytes = $2, checksum_sha256 = $3,
                 width = $4, height = $5,
                 preview_storage_key = $6, preview_mime_type = $7,
                 preview_size_bytes = $8, preview_checksum_sha256 = $9,
                 preview_width = $10, preview_height = $11,
                 upload_expires_at = NULL, rejection_reason = NULL, ready_at = now()
             WHERE id = $1 AND provider_id = $12 AND status = 'PENDING_UPLOAD'
             RETURNING *`,
            [mediaId, stored.sizeBytes, stored.checksumSha256, stored.width, stored.height,
             stored.previewStorageKey, stored.previewMimeType, stored.previewSizeBytes,
             stored.previewChecksumSha256, stored.previewWidth, stored.previewHeight,
             context.providerId]
          );
          if (result.rowCount !== 1) throw notFound();
          await audit(transaction, context, context.providerId, "PROVIDER_PROFILE_MEDIA_UPLOADED", mediaId, {
            kind, sizeBytes: stored.sizeBytes, width: stored.width, height: stored.height
          });
          return serializeMedia(result.rows[0]);
        });
      } catch (error) {
        await storage.remove(key).catch(() => {});
        await rejectUpload(context, mediaId,
          error instanceof ServiceError ? error.message : "La carga no se ha podido completar.",
          typeof error?.code === "string" ? error.code : "PROFILE_MEDIA_UPLOAD_FAILED");
        if (error instanceof ServiceError) throw error;
        throw translateDatabaseError(error);
      }
    },

    async reorderGallery(rawContext, input = {}) {
      const context = providerContext(rawContext);
      const mediaIds = galleryOrder(input.mediaIds);
      try {
        return await database.withContext(context, async (transaction) => {
          await makeProfileEditable(transaction, context);
          const current = await transaction.query(
            `SELECT id
             FROM provider_profile_media
             WHERE provider_id = $1 AND kind = 'GALLERY' AND status = 'READY'
             ORDER BY sort_order, created_at
             FOR UPDATE`,
            [context.providerId]
          );
          const currentIds = current.rows.map((row) => row.id);
          const currentSet = new Set(currentIds);
          if (currentIds.length !== mediaIds.length || mediaIds.some((mediaId) => !currentSet.has(mediaId))) {
            throw new ServiceError(
              "GALLERY_ORDER_STALE",
              "La galería ha cambiado. Recarga el perfil antes de volver a ordenar las fotografías.",
              409
            );
          }

          if (mediaIds.length) {
            await transaction.query(
              `UPDATE provider_profile_media media
               SET sort_order = ordered.position - 1
               FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(id, position)
               WHERE media.provider_id = $1
                 AND media.id = ordered.id
                 AND media.kind = 'GALLERY'
                 AND media.status = 'READY'`,
              [context.providerId, mediaIds]
            );
            for (const [position, mediaId] of mediaIds.entries()) {
              await audit(transaction, context, context.providerId, "PROVIDER_PROFILE_GALLERY_REORDERED", mediaId, { position });
            }
          }

          const result = await transaction.query(
            `SELECT * FROM provider_profile_media
             WHERE provider_id = $1 AND kind = 'GALLERY' AND status = 'READY'
             ORDER BY sort_order, created_at`,
            [context.providerId]
          );
          return result.rows.map((row) => serializeMedia(row));
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async updateMetadata(rawContext, rawMediaId, input = {}) {
      const context = providerContext(rawContext);
      const mediaId = uuid(rawMediaId);
      const selectedAltText = altText(input.altText, { nullable: true });
      const sortOrder = input.sortOrder === undefined ? null : Number(input.sortOrder);
      if (sortOrder !== null && (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000)) {
        throw new ServiceError("VALIDATION_ERROR", "El orden de la imagen no es válido.", 422, { field: "sortOrder" });
      }
      if (selectedAltText === null && sortOrder === null) {
        throw new ServiceError("VALIDATION_ERROR", "No hay cambios que guardar.", 422);
      }
      try {
        return await database.withContext(context, async (transaction) => {
          await makeProfileEditable(transaction, context);
          const result = await transaction.query(
            `UPDATE provider_profile_media
             SET alt_text = COALESCE($3, alt_text), sort_order = COALESCE($4, sort_order)
             WHERE id = $1 AND provider_id = $2 AND status = 'READY'
             RETURNING *`,
            [mediaId, context.providerId, selectedAltText, sortOrder]
          );
          if (result.rowCount !== 1) throw notFound();
          await audit(transaction, context, context.providerId, "PROVIDER_PROFILE_MEDIA_METADATA_UPDATED", mediaId);
          return serializeMedia(result.rows[0]);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async remove(rawContext, rawMediaId) {
      const context = providerContext(rawContext);
      const mediaId = uuid(rawMediaId);
      let key;
      let retained = false;
      try {
        await database.withContext(context, async (transaction) => {
          await makeProfileEditable(transaction, context);
          const result = await transaction.query(
            `UPDATE provider_profile_media
             SET status = 'DELETED'
             WHERE id = $1 AND provider_id = $2 AND status <> 'DELETED'
             RETURNING storage_key`,
            [mediaId, context.providerId]
          );
          if (result.rowCount !== 1) throw notFound();
          key = result.rows[0].storage_key;
          const reference = await transaction.query(
            `SELECT EXISTS (
               SELECT 1
               FROM provider_profile_publications publication
               CROSS JOIN LATERAL jsonb_array_elements(COALESCE(publication.snapshot -> 'media', '[]'::jsonb)) item
               WHERE publication.provider_id = $1 AND item ->> 'id' = $2
             ) AS published_reference`,
            [context.providerId, mediaId]
          );
          retained = Boolean(reference.rows[0]?.published_reference);
          await audit(transaction, context, context.providerId, "PROVIDER_PROFILE_MEDIA_DELETED", mediaId, { retained });
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
      if (!retained && key) await storage.remove(key).catch(() => {});
      return { deleted: true, retainedForPublishedRevision: retained };
    },

    async open(rawContext, rawMediaId, rangeHeader) {
      const context = providerContext(rawContext);
      const mediaId = uuid(rawMediaId);
      const { row } = await openRow(context, context.providerId, mediaId, false);
      if (!row.preview_storage_key) throw notFound();
      return {
        ...(await storage.openPreview(row.preview_storage_key, rangeHeader)),
        mimeType: row.preview_mime_type,
        originalFilename: `${row.original_filename.replace(/\.[^.]+$/, "")}-preview.webp`
      };
    },

    async openAdmin(rawContext, rawProviderId, rawMediaId, rangeHeader) {
      const context = adminContext(rawContext);
      const providerId = uuid(rawProviderId, "providerId");
      const mediaId = uuid(rawMediaId);
      const { row } = await openRow(context, providerId, mediaId, true);
      if (!row.preview_storage_key) throw notFound();
      return {
        ...(await storage.openPreview(row.preview_storage_key, rangeHeader)),
        mimeType: row.preview_mime_type,
        originalFilename: `${row.original_filename.replace(/\.[^.]+$/, "")}-preview.webp`
      };
    }
  });
}