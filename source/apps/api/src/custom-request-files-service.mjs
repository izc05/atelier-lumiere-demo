import { randomUUID } from "node:crypto";
import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);
const MAX_BYTES = 12 * 1024 * 1024;
const ZERO_CHECKSUM = "0".repeat(64);

function context(value) {
  if (!value || !UUID_PATTERN.test(value.userId ?? "")) {
    throw new ServiceError("UNAUTHORIZED", "La sesión no es válida.", 401);
  }
  if (value.role === "CUSTOMER" && value.providerId === null) {
    return { role: value.role, userId: value.userId.toLowerCase(), providerId: null };
  }
  if (
    ["PROVIDER_OWNER", "PROVIDER_MEMBER"].includes(value.role)
    && UUID_PATTERN.test(value.providerId ?? "")
  ) {
    return {
      role: value.role,
      userId: value.userId.toLowerCase(),
      providerId: value.providerId.toLowerCase()
    };
  }
  throw new ServiceError("UNAUTHORIZED", "La sesión no es válida.", 401);
}
function uuid(value, field, { optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional) return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}
function mimeType(value) {
  const normalized = typeof value === "string"
    ? value.split(";", 1)[0].trim().toLowerCase()
    : "";
  if (!ALLOWED_MIME_TYPES.has(normalized)) {
    throw new ServiceError(
      "CUSTOM_FILE_TYPE_NOT_ALLOWED",
      "Solo se admiten imágenes JPEG, PNG, WebP o documentos PDF.",
      415
    );
  }
  return normalized;
}
function filename(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(typeof value === "string" ? value : "");
  } catch {
    throw new ServiceError("CUSTOM_FILE_NAME_INVALID", "El nombre del archivo no es válido.", 422);
  }
  const normalized = decoded.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .trim();
  if (!normalized || normalized.length > 240) {
    throw new ServiceError("CUSTOM_FILE_NAME_INVALID", "El nombre del archivo no es válido.", 422);
  }
  return normalized;
}
function contentLength(value) {
  const raw = String(value ?? "").trim();
  const parsed = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_BYTES) {
    throw new ServiceError(
      "CUSTOM_FILE_SIZE_INVALID",
      "Cada archivo debe ocupar como máximo 12 MB.",
      413,
      { maximumBytes: MAX_BYTES }
    );
  }
  return parsed;
}
function serialize(row, actor) {
  return {
    id: row.id,
    requestId: row.request_id,
    messageId: row.message_id,
    uploadedBy: row.uploaded_by,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    sizeBytes: Number(row.size_bytes),
    checksumSha256: row.status === "READY" ? row.checksum_sha256 : null,
    status: row.status,
    rejectionReason: row.rejection_reason,
    readyAt: row.ready_at,
    createdAt: row.created_at,
    canDelete: row.status !== "DELETED" && (
      row.uploaded_by === actor.userId
      || actor.role === "PROVIDER_OWNER"
    )
  };
}
function notFound() {
  return new ServiceError("CUSTOM_FILE_NOT_FOUND", "No se ha encontrado el archivo.", 404);
}
function translate(error) {
  if (error instanceof ServiceError) return error;
  const message = String(error?.message ?? "");
  if (error?.code === "23514" && message.includes("CUSTOM_REQUEST_FILE_LIMIT_EXCEEDED")) {
    return new ServiceError(
      "CUSTOM_FILE_LIMIT_REACHED",
      "El encargo ya tiene doce archivos activos.",
      409,
      { maximum: 12 }
    );
  }
  if (error?.code === "23503") {
    return new ServiceError(
      "CUSTOM_FILE_SCOPE_INVALID",
      "El archivo no pertenece a esta conversación.",
      422
    );
  }
  if (error?.code === "42501") {
    return new ServiceError(
      "CUSTOM_FILE_ACCESS_DENIED",
      "No puedes modificar los archivos de este encargo.",
      403
    );
  }
  if (error?.code === "23505") {
    return new ServiceError("CUSTOM_FILE_CONFLICT", "El archivo ya existe.", 409);
  }
  return error;
}

async function setUploadContext(transaction, fileId) {
  await transaction.query("SELECT set_config('app.custom_request_file_upload_id', $1, true)", [fileId]);
}

export function createCustomRequestFilesService({
  database,
  storage,
  uploadTtlMinutes = 15,
  now = () => new Date(),
  logger = console
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createCustomRequestFilesService necesita una base de datos.");
  }
  if (!storage || !["buildStorageKey", "write", "openRead", "remove"].every((key) => typeof storage[key] === "function")) {
    throw new TypeError("createCustomRequestFilesService necesita almacenamiento privado.");
  }
  if (!Number.isInteger(uploadTtlMinutes) || uploadTtlMinutes < 5 || uploadTtlMinutes > 60) {
    throw new TypeError("uploadTtlMinutes debe estar entre 5 y 60.");
  }

  async function rejectUpload(actor, fileId, reason) {
    try {
      await database.withContext(actor, async (transaction) => {
        await setUploadContext(transaction, fileId);
        await transaction.query(
          `UPDATE custom_request_files
           SET status = 'REJECTED', rejection_reason = $2,
               upload_expires_at = NULL
           WHERE id = $1 AND status = 'PENDING_UPLOAD'`,
          [fileId, String(reason).slice(0, 1000)]
        );
      });
    } catch (error) {
      logger.error("No se pudo registrar el rechazo de un archivo de encargo.", {
        code: typeof error?.code === "string" ? error.code : "CUSTOM_FILE_REJECTION_FAILED"
      });
    }
  }

  return Object.freeze({
    async upload(rawContext, rawRequestId, metadata = {}, stream) {
      const actor = context(rawContext);
      const requestId = uuid(rawRequestId, "requestId");
      const selectedMimeType = mimeType(metadata.mimeType);
      const originalFilename = filename(metadata.originalFilename);
      const expectedBytes = contentLength(metadata.contentLength);
      const messageId = uuid(metadata.messageId, "messageId", { optional: true });
      const fileId = randomUUID();
      const expiresAt = new Date(now().getTime() + uploadTtlMinutes * 60 * 1000);
      let request;
      let storageKey;

      try {
        await database.withContext(actor, async (transaction) => {
          const result = await transaction.query(
            `SELECT id, order_id, provider_id, customer_user_id, status
             FROM custom_requests
             WHERE id = $1`,
            [requestId]
          );
          request = result.rows[0];
          if (!request) {
            throw new ServiceError("CUSTOM_REQUEST_NOT_FOUND", "No se ha encontrado el encargo.", 404);
          }
          if (["COMPLETED", "CANCELLED"].includes(request.status)) {
            throw new ServiceError(
              "CUSTOM_REQUEST_CLOSED",
              "No se pueden añadir archivos a un encargo cerrado.",
              409
            );
          }
          storageKey = storage.buildStorageKey({
            providerId: request.provider_id,
            requestId,
            fileId,
            mimeType: selectedMimeType
          });
          await transaction.query(
            `INSERT INTO custom_request_files (
               id, request_id, message_id, order_id, provider_id,
               customer_user_id, uploaded_by, mime_type,
               original_filename, storage_key, size_bytes,
               checksum_sha256, status, upload_expires_at
             ) VALUES (
               $1, $2, $3, $4, $5,
               $6, $7, $8,
               $9, $10, $11,
               $12, 'PENDING_UPLOAD', $13
             )`,
            [
              fileId, requestId, messageId, request.order_id, request.provider_id,
              request.customer_user_id, actor.userId, selectedMimeType,
              originalFilename, storageKey, expectedBytes,
              ZERO_CHECKSUM, expiresAt
            ]
          );
        });
      } catch (error) {
        throw translate(error);
      }

      try {
        const stored = await storage.write({
          stream,
          storageKey,
          expectedBytes,
          mimeType: selectedMimeType
        });
        return await database.withContext(actor, async (transaction) => {
          await setUploadContext(transaction, fileId);
          const result = await transaction.query(
            `UPDATE custom_request_files
             SET status = 'READY', size_bytes = $2,
                 checksum_sha256 = $3, ready_at = now(),
                 upload_expires_at = NULL
             WHERE id = $1 AND request_id = $4 AND status = 'PENDING_UPLOAD'
             RETURNING *`,
            [fileId, stored.sizeBytes, stored.checksumSha256, requestId]
          );
          if (result.rowCount !== 1) throw notFound();
          await transaction.query(
            `INSERT INTO order_events (
               order_id, provider_id, customer_user_id, actor_user_id,
               actor_role, event_type, metadata
             ) VALUES ($1, $2, $3, $4, $5, 'CUSTOM_REQUEST_FILE_UPLOADED', $6::jsonb)`,
            [
              request.order_id, request.provider_id, request.customer_user_id,
              actor.userId, actor.role,
              JSON.stringify({ requestId, fileId, originalFilename, mimeType: selectedMimeType })
            ]
          );
          await transaction.query(
            `INSERT INTO order_notifications (
               order_id, provider_id, customer_user_id, recipient_user_id,
               event_type, payload
             ) VALUES ($1, $2, $3, $4, 'CUSTOM_REQUEST_FILE_UPLOADED', $5::jsonb)`,
            [
              request.order_id,
              request.provider_id,
              request.customer_user_id,
              actor.role === "CUSTOMER" ? null : request.customer_user_id,
              JSON.stringify({ requestId, fileId, originalFilename })
            ]
          );
          return serialize(result.rows[0], actor);
        });
      } catch (error) {
        await storage.remove(storageKey).catch(() => {});
        await rejectUpload(
          actor,
          fileId,
          error instanceof ServiceError ? error.message : "La carga no se pudo completar."
        );
        if (error instanceof ServiceError) throw error;
        throw translate(error);
      }
    },

    async open(rawContext, rawRequestId, rawFileId, rangeHeader) {
      const actor = context(rawContext);
      const requestId = uuid(rawRequestId, "requestId");
      const fileId = uuid(rawFileId, "fileId");
      const row = await database.withContext(actor, async (transaction) => {
        const result = await transaction.query(
          `SELECT file.*
           FROM custom_request_files file
           INNER JOIN custom_requests request ON request.id = file.request_id
           WHERE file.id = $1 AND file.request_id = $2
             AND file.status = 'READY'`,
          [fileId, requestId]
        );
        return result.rows[0] ?? null;
      });
      if (!row) throw notFound();
      return {
        ...(await storage.openRead(row.storage_key, rangeHeader)),
        mimeType: row.mime_type,
        filename: row.original_filename
      };
    },

    async remove(rawContext, rawRequestId, rawFileId) {
      const actor = context(rawContext);
      const requestId = uuid(rawRequestId, "requestId");
      const fileId = uuid(rawFileId, "fileId");
      const row = await database.withContext(actor, async (transaction) => {
        const current = await transaction.query(
          `SELECT * FROM custom_request_files
           WHERE id = $1 AND request_id = $2 AND status <> 'DELETED'`,
          [fileId, requestId]
        );
        const file = current.rows[0];
        if (!file) throw notFound();
        if (file.uploaded_by !== actor.userId && actor.role !== "PROVIDER_OWNER") {
          throw new ServiceError(
            "CUSTOM_FILE_DELETE_DENIED",
            "Solo quien subió el archivo o el responsable del taller puede retirarlo.",
            403
          );
        }
        const updated = await transaction.query(
          `UPDATE custom_request_files
           SET status = 'DELETED', deleted_at = now()
           WHERE id = $1 AND request_id = $2
           RETURNING *`,
          [fileId, requestId]
        );
        await transaction.query(
          `INSERT INTO order_events (
             order_id, provider_id, customer_user_id, actor_user_id,
             actor_role, event_type, metadata
           ) VALUES ($1, $2, $3, $4, $5, 'CUSTOM_REQUEST_FILE_DELETED', $6::jsonb)`,
          [
            file.order_id, file.provider_id, file.customer_user_id,
            actor.userId, actor.role,
            JSON.stringify({ requestId, fileId, originalFilename: file.original_filename })
          ]
        );
        return updated.rows[0];
      });
      await storage.remove(row.storage_key).catch(() => {});
      return { id: row.id, deleted: true };
    }
  });
}
