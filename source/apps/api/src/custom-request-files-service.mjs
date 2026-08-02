import { randomUUID } from "node:crypto";
import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 20;

function uuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function actorContext(context) {
  if (!context || !UUID_PATTERN.test(context.userId ?? "")) {
    throw new ServiceError("UNAUTHORIZED", "La sesión no es válida.", 401);
  }
  if (context.role === "CUSTOMER") {
    return { role: "CUSTOMER", userId: context.userId.toLowerCase(), providerId: null };
  }
  if (["PROVIDER_OWNER", "PROVIDER_MEMBER"].includes(context.role) && UUID_PATTERN.test(context.providerId ?? "")) {
    return { role: context.role, userId: context.userId.toLowerCase(), providerId: context.providerId.toLowerCase() };
  }
  throw new ServiceError("UNAUTHORIZED", "La sesión no es válida.", 401);
}

function normalizedMimeType(value) {
  const mimeType = typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ServiceError("REQUEST_FILE_TYPE_NOT_ALLOWED", "Solo se admiten JPEG, PNG, WebP o PDF.", 415);
  }
  return mimeType;
}

function filename(value) {
  let decoded;
  try { decoded = decodeURIComponent(typeof value === "string" ? value : ""); }
  catch { throw new ServiceError("REQUEST_FILE_FILENAME_INVALID", "El nombre del archivo no es válido.", 422); }
  const clean = decoded.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "-").trim();
  if (!clean || clean.length > 240) throw new ServiceError("REQUEST_FILE_FILENAME_INVALID", "El nombre del archivo no es válido.", 422);
  return clean;
}

function contentLength(value) {
  const raw = String(value ?? "").trim();
  const size = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES) {
    throw new ServiceError("REQUEST_FILE_SIZE_INVALID", "El archivo debe ocupar como máximo 12 MB.", 413, { maximumBytes: MAX_FILE_BYTES });
  }
  return size;
}

function serialize(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    messageId: row.message_id,
    uploadedBy: row.uploaded_by,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
    readyAt: row.ready_at,
    createdAt: row.created_at,
    contentPath: row.status === "READY" ? `/api/request-files/${row.id}/content` : null
  };
}

function translateDatabaseError(error) {
  if (error instanceof ServiceError) return error;
  const message = String(error?.message ?? "");
  if (error?.code === "23514" && message.includes("REQUEST_FILE_LIMIT_EXCEEDED")) {
    return new ServiceError("REQUEST_FILE_LIMIT_REACHED", "El encargo ya tiene veinte archivos.", 409, { maximum: MAX_FILES_PER_REQUEST });
  }
  if (error?.code === "42501") {
    return new ServiceError("REQUEST_FILE_FORBIDDEN", "No tienes permiso para modificar este archivo.", 403);
  }
  if (error?.code === "23503") {
    return new ServiceError("REQUEST_FILE_SCOPE_INVALID", "El archivo no pertenece a esta conversación.", 409);
  }
  return error;
}

export function createCustomRequestFilesService({ database, storage } = {}) {
  if (!database || typeof database.withContext !== "function") throw new TypeError("createCustomRequestFilesService necesita una base de datos.");
  if (!storage || typeof storage.write !== "function" || typeof storage.openRead !== "function" || typeof storage.remove !== "function") {
    throw new TypeError("createCustomRequestFilesService necesita almacenamiento privado.");
  }

  async function requestScope(transaction, context, requestId) {
    const params = context.role === "CUSTOMER" ? [requestId, context.userId] : [requestId, context.providerId];
    const predicate = context.role === "CUSTOMER" ? "request.customer_user_id = $2" : "request.provider_id = $2";
    const result = await transaction.query(
      `SELECT request.id, request.order_id, request.provider_id, request.customer_user_id, request.status
       FROM custom_requests request
       WHERE request.id = $1 AND ${predicate}`,
      params
    );
    if (result.rowCount !== 1) throw new ServiceError("CUSTOM_REQUEST_NOT_FOUND", "No se ha encontrado el encargo.", 404);
    return result.rows[0];
  }

  return Object.freeze({
    async upload(rawContext, rawRequestId, { messageId, originalFilename, mimeType, expectedBytes, stream } = {}) {
      const context = actorContext(rawContext);
      const requestId = uuid(rawRequestId, "requestId");
      const selectedMessageId = messageId ? uuid(messageId, "messageId") : null;
      const selectedMimeType = normalizedMimeType(mimeType);
      const selectedFilename = filename(originalFilename);
      const selectedBytes = contentLength(expectedBytes);
      const fileId = randomUUID();
      let stored;

      const scope = await database.withContext(context, async (transaction) => {
        const request = await requestScope(transaction, context, requestId);
        if (["COMPLETED", "CANCELLED"].includes(request.status)) {
          throw new ServiceError("CUSTOM_REQUEST_LOCKED", "El encargo ya no admite archivos.", 409);
        }
        if (selectedMessageId) {
          const message = await transaction.query(
            "SELECT 1 FROM custom_request_messages WHERE id = $1 AND request_id = $2",
            [selectedMessageId, requestId]
          );
          if (message.rowCount !== 1) throw new ServiceError("REQUEST_FILE_MESSAGE_NOT_FOUND", "El mensaje no pertenece a esta conversación.", 409);
        }
        const count = await transaction.query(
          "SELECT count(*)::integer AS total FROM custom_request_files WHERE request_id = $1 AND status <> 'DELETED'",
          [requestId]
        );
        if (count.rows[0].total >= MAX_FILES_PER_REQUEST) {
          throw new ServiceError("REQUEST_FILE_LIMIT_REACHED", "El encargo ya tiene veinte archivos.", 409, { maximum: MAX_FILES_PER_REQUEST });
        }
        return request;
      });

      const storageKey = storage.buildStorageKey({ providerId: scope.provider_id, requestId, fileId, mimeType: selectedMimeType });
      try {
        stored = await storage.write({ stream, storageKey, expectedBytes: selectedBytes, mimeType: selectedMimeType });
        return await database.withContext(context, async (transaction) => {
          await requestScope(transaction, context, requestId);
          const result = await transaction.query(
            `INSERT INTO custom_request_files (
               id, request_id, message_id, order_id, provider_id, customer_user_id,
               uploaded_by, mime_type, original_filename, storage_key,
               size_bytes, checksum_sha256, status, ready_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'READY',now())
             RETURNING id, request_id, message_id, uploaded_by, mime_type,
                       original_filename, size_bytes, status, ready_at, created_at`,
            [fileId, requestId, selectedMessageId, scope.order_id, scope.provider_id, scope.customer_user_id,
             context.userId, selectedMimeType, selectedFilename, stored.storageKey, stored.sizeBytes, stored.checksumSha256]
          );
          await transaction.query(
            `INSERT INTO order_events (
               order_id, provider_id, customer_user_id, actor_user_id, actor_role,
               event_type, metadata
             ) VALUES ($1,$2,$3,$4,$5,'CUSTOM_REQUEST_FILE', $6::jsonb)`,
            [scope.order_id, scope.provider_id, scope.customer_user_id, context.userId, context.role,
             JSON.stringify({ requestId, fileId, messageId: selectedMessageId, filename: selectedFilename, sizeBytes: stored.sizeBytes })]
          );
          await transaction.query(
            `INSERT INTO order_notifications (
               order_id, provider_id, customer_user_id, recipient_user_id, event_type, payload
             ) VALUES ($1,$2,$3,$4,'CUSTOM_REQUEST_FILE',$5::jsonb)`,
            [scope.order_id, scope.provider_id, scope.customer_user_id,
             context.role === "CUSTOMER" ? null : scope.customer_user_id,
             JSON.stringify({ requestId, fileId, filename: selectedFilename })]
          );
          return serialize(result.rows[0]);
        });
      } catch (error) {
        if (stored?.storageKey) await storage.remove(stored.storageKey).catch(() => {});
        throw translateDatabaseError(error);
      }
    },

    async open(rawContext, rawFileId, rangeHeader) {
      const context = actorContext(rawContext);
      const fileId = uuid(rawFileId, "fileId");
      const row = await database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT id, storage_key, mime_type, original_filename, size_bytes
           FROM custom_request_files
           WHERE id = $1 AND status = 'READY'`,
          [fileId]
        );
        return result.rows[0] ?? null;
      });
      if (!row) throw new ServiceError("REQUEST_FILE_NOT_FOUND", "No se ha encontrado el archivo.", 404);
      return {
        ...(await storage.openRead(row.storage_key, rangeHeader)),
        mimeType: row.mime_type,
        filename: row.original_filename,
        declaredSizeBytes: Number(row.size_bytes)
      };
    },

    async remove(rawContext, rawFileId) {
      const context = actorContext(rawContext);
      const fileId = uuid(rawFileId, "fileId");
      const row = await database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE custom_request_files
           SET status = 'DELETED', deleted_at = now()
           WHERE id = $1 AND uploaded_by = $2 AND status = 'READY'
           RETURNING storage_key, request_id, order_id, provider_id, customer_user_id`,
          [fileId, context.userId]
        );
        if (result.rowCount !== 1) throw new ServiceError("REQUEST_FILE_NOT_FOUND", "No se ha encontrado un archivo propio que pueda retirarse.", 404);
        const item = result.rows[0];
        await transaction.query(
          `INSERT INTO order_events (
             order_id, provider_id, customer_user_id, actor_user_id, actor_role,
             event_type, metadata
           ) VALUES ($1,$2,$3,$4,$5,'CUSTOM_REQUEST_FILE_DELETED',$6::jsonb)`,
          [item.order_id, item.provider_id, item.customer_user_id, context.userId, context.role,
           JSON.stringify({ requestId: item.request_id, fileId })]
        );
        return item;
      });
      await storage.remove(row.storage_key).catch(() => {});
      return { deleted: true, id: fileId };
    }
  });
}
