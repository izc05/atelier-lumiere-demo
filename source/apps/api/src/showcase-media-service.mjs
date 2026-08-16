import { randomUUID } from "node:crypto";
import { extensionForMimeType } from "./media-storage-service.mjs";
import { ServiceError } from "./providers-service.mjs";
import { SHOWCASE_SLOTS, SHOWCASE_SLOT_META, SHOWCASE_SLOT_SET } from "./showcase-slots.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const PUBLIC_CONTEXT = Object.freeze({
  role: "CATALOG_READER",
  userId: "00000000-0000-4000-8000-000000000002",
  providerId: null
});

function adminContext(context) {
  if (context?.role !== "ADMIN" || !UUID_PATTERN.test(String(context.userId || ""))) {
    throw new ServiceError("UNAUTHORIZED", "Necesitas una sesión administrativa.", 401);
  }
  return { role: "ADMIN", userId: String(context.userId).toLowerCase(), providerId: null };
}

function slotKey(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!SHOWCASE_SLOT_SET.has(normalized)) {
    throw new ServiceError("SHOWCASE_SLOT_INVALID", "El bloque editorial solicitado no existe.", 422, { field: "slotKey" });
  }
  return normalized;
}

function mimeType(value) {
  const normalized = typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";
  if (!ALLOWED_MIME_TYPES.has(normalized)) {
    throw new ServiceError("MEDIA_TYPE_NOT_ALLOWED", "Solo se admiten imágenes JPEG, PNG o WebP.", 415);
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

function altText(value) {
  if (value === undefined || value === null || value === "") return "";
  let decoded;
  try {
    decoded = decodeURIComponent(String(value));
  } catch {
    throw new ServiceError("VALIDATION_ERROR", "El texto alternativo no es válido.", 422, { field: "altText" });
  }
  const normalized = decoded.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (normalized.length > 240) {
    throw new ServiceError("VALIDATION_ERROR", "El texto alternativo no es válido.", 422, { field: "altText" });
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

function focal(value, field, fallback = 50) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new ServiceError("VALIDATION_ERROR", `${field} debe estar entre 0 y 100.`, 422, { field });
  }
  return parsed;
}

function showcaseStorageKey(selectedSlot, mediaId, selectedMimeType) {
  const extension = extensionForMimeType(selectedMimeType);
  return `showcase/${selectedSlot.toLowerCase()}/${mediaId}/original.${extension}`;
}

function serialize(row, { publicView = false } = {}) {
  const meta = SHOWCASE_SLOT_META[row.slot_key];
  const prefix = publicView ? "/api/showcase" : "/api/admin/showcase";
  return {
    id: row.id,
    slotKey: row.slot_key,
    label: meta?.label ?? row.slot_key,
    page: meta?.page ?? null,
    viewport: meta?.viewport ?? null,
    altText: row.alt_text,
    width: row.preview_width,
    height: row.preview_height,
    focalX: Number(row.focal_x),
    focalY: Number(row.focal_y),
    updatedAt: row.updated_at,
    previewPath: `${prefix}/${row.slot_key}/preview`,
    ...(publicView ? {} : {
      mimeType: row.mime_type,
      originalFilename: row.original_filename,
      sizeBytes: Number(row.size_bytes),
      originalWidth: row.width,
      originalHeight: row.height
    })
  };
}

async function audit(transaction, context, row, action, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, NULL, $2, 'site_showcase_media', $3, $4::jsonb)`,
    [context.userId, action, row.id, JSON.stringify({ slotKey: row.slot_key, ...metadata })]
  );
}

function notFound() {
  return new ServiceError("SHOWCASE_MEDIA_NOT_FOUND", "Ese bloque todavía no tiene una imagen editorial.", 404);
}

export function createShowcaseMediaService({ database, storage, logger = console } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createShowcaseMediaService necesita una base de datos.");
  }
  if (!storage || typeof storage.write !== "function" || typeof storage.openPreview !== "function") {
    throw new TypeError("createShowcaseMediaService necesita almacenamiento privado con previews.");
  }

  async function readRow(context, selectedSlot) {
    return database.withContext(context, async (transaction) => {
      const result = await transaction.query(
        "SELECT * FROM site_showcase_media WHERE slot_key = $1",
        [selectedSlot]
      );
      if (result.rowCount !== 1) throw notFound();
      return result.rows[0];
    });
  }

  return Object.freeze({
    async listAdmin(rawContext) {
      const context = adminContext(rawContext);
      const rows = await database.withContext(context, async (transaction) => {
        const result = await transaction.query("SELECT * FROM site_showcase_media ORDER BY slot_key");
        return result.rows;
      });
      const bySlot = new Map(rows.map((row) => [row.slot_key, row]));
      return SHOWCASE_SLOTS.map((key) => ({
        slotKey: key,
        ...SHOWCASE_SLOT_META[key],
        media: bySlot.has(key) ? serialize(bySlot.get(key)) : null
      }));
    },

    async listPublic() {
      const rows = await database.withContext(PUBLIC_CONTEXT, async (transaction) => {
        const result = await transaction.query("SELECT * FROM site_showcase_media ORDER BY slot_key");
        return result.rows;
      });
      return rows.map((row) => serialize(row, { publicView: true }));
    },

    async upload(rawContext, rawSlot, metadata = {}, stream) {
      const context = adminContext(rawContext);
      const selectedSlot = slotKey(rawSlot);
      const selectedMimeType = mimeType(metadata.mimeType);
      const filename = originalFilename(metadata.originalFilename);
      const selectedAltText = altText(metadata.altText);
      const expectedBytes = contentLength(metadata.contentLength);
      const focalX = focal(metadata.focalX, "focalX");
      const focalY = focal(metadata.focalY, "focalY");
      const mediaId = randomUUID();
      const storageKey = showcaseStorageKey(selectedSlot, mediaId, selectedMimeType);
      let stored;

      try {
        stored = await storage.write({
          stream,
          storageKey,
          expectedBytes,
          mimeType: selectedMimeType
        });

        const saved = await database.withContext(context, async (transaction) => {
          const previous = await transaction.query(
            "SELECT id, storage_key FROM site_showcase_media WHERE slot_key = $1 FOR UPDATE",
            [selectedSlot]
          );
          const result = await transaction.query(
            `INSERT INTO site_showcase_media (
               slot_key, mime_type, original_filename, storage_key, size_bytes, checksum_sha256,
               alt_text, width, height, preview_storage_key, preview_mime_type, preview_size_bytes,
               preview_checksum_sha256, preview_width, preview_height, focal_x, focal_y, updated_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
             ON CONFLICT (slot_key) DO UPDATE SET
               mime_type = EXCLUDED.mime_type,
               original_filename = EXCLUDED.original_filename,
               storage_key = EXCLUDED.storage_key,
               size_bytes = EXCLUDED.size_bytes,
               checksum_sha256 = EXCLUDED.checksum_sha256,
               alt_text = EXCLUDED.alt_text,
               width = EXCLUDED.width,
               height = EXCLUDED.height,
               preview_storage_key = EXCLUDED.preview_storage_key,
               preview_mime_type = EXCLUDED.preview_mime_type,
               preview_size_bytes = EXCLUDED.preview_size_bytes,
               preview_checksum_sha256 = EXCLUDED.preview_checksum_sha256,
               preview_width = EXCLUDED.preview_width,
               preview_height = EXCLUDED.preview_height,
               focal_x = EXCLUDED.focal_x,
               focal_y = EXCLUDED.focal_y,
               updated_by = EXCLUDED.updated_by
             RETURNING *`,
            [selectedSlot, stored.mimeType, filename, stored.storageKey, stored.sizeBytes,
             stored.checksumSha256, selectedAltText, stored.width, stored.height,
             stored.previewStorageKey, stored.previewMimeType, stored.previewSizeBytes,
             stored.previewChecksumSha256, stored.previewWidth, stored.previewHeight,
             focalX, focalY, context.userId]
          );
          await audit(transaction, context, result.rows[0], "SHOWCASE_MEDIA_REPLACED", {
            previousMediaId: previous.rows[0]?.id ?? null
          });
          return { row: result.rows[0], previousStorageKey: previous.rows[0]?.storage_key ?? null };
        });

        if (saved.previousStorageKey && saved.previousStorageKey !== stored.storageKey) {
          await storage.remove(saved.previousStorageKey).catch((error) => {
            logger.warn("No se pudo limpiar la imagen editorial anterior.", {
              code: typeof error?.code === "string" ? error.code : "SHOWCASE_MEDIA_CLEANUP_FAILED"
            });
          });
        }
        return serialize(saved.row);
      } catch (error) {
        if (stored?.storageKey) await storage.remove(stored.storageKey).catch(() => {});
        throw error;
      }
    },

    async updateMetadata(rawContext, rawSlot, values = {}) {
      const context = adminContext(rawContext);
      const selectedSlot = slotKey(rawSlot);
      const selectedAltText = values.altText === undefined ? null : altText(values.altText);
      const focalX = values.focalX === undefined ? null : focal(values.focalX, "focalX");
      const focalY = values.focalY === undefined ? null : focal(values.focalY, "focalY");
      if (selectedAltText === null && focalX === null && focalY === null) {
        throw new ServiceError("VALIDATION_ERROR", "No hay cambios que guardar.", 422);
      }
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE site_showcase_media
           SET alt_text = COALESCE($2, alt_text),
               focal_x = COALESCE($3, focal_x),
               focal_y = COALESCE($4, focal_y),
               updated_by = $5
           WHERE slot_key = $1
           RETURNING *`,
          [selectedSlot, selectedAltText, focalX, focalY, context.userId]
        );
        if (result.rowCount !== 1) throw notFound();
        await audit(transaction, context, result.rows[0], "SHOWCASE_MEDIA_METADATA_UPDATED");
        return serialize(result.rows[0]);
      });
    },

    async remove(rawContext, rawSlot) {
      const context = adminContext(rawContext);
      const selectedSlot = slotKey(rawSlot);
      const removed = await database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          "DELETE FROM site_showcase_media WHERE slot_key = $1 RETURNING *",
          [selectedSlot]
        );
        if (result.rowCount !== 1) throw notFound();
        await audit(transaction, context, result.rows[0], "SHOWCASE_MEDIA_REMOVED");
        return result.rows[0];
      });
      await storage.remove(removed.storage_key).catch((error) => {
        logger.warn("No se pudo eliminar el archivo de un bloque editorial retirado.", {
          code: typeof error?.code === "string" ? error.code : "SHOWCASE_MEDIA_REMOVE_FAILED"
        });
      });
      return { slotKey: selectedSlot, removed: true };
    },

    async openAdminPreview(rawContext, rawSlot, rangeHeader, width = null) {
      const context = adminContext(rawContext);
      const row = await readRow(context, slotKey(rawSlot));
      const opened = await storage.openPreview(row.preview_storage_key, rangeHeader, width);
      return { ...opened, mimeType: row.preview_mime_type, originalFilename: row.original_filename };
    },

    async openPublicPreview(rawSlot, rangeHeader, width = null) {
      const row = await readRow(PUBLIC_CONTEXT, slotKey(rawSlot));
      const opened = await storage.openPreview(row.preview_storage_key, rangeHeader, width);
      return { ...opened, mimeType: row.preview_mime_type, originalFilename: row.original_filename };
    }
  });
}
