import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ServiceError } from "./providers-service.mjs";

const EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf"
});

function failure(code, message, statusCode = 422, details) {
  return new ServiceError(code, message, statusCode, details);
}

function safeAbsolute(root, storageKey) {
  if (typeof storageKey !== "string" || !/^[a-z0-9/_-]+\.[a-z0-9]+$/i.test(storageKey)) {
    throw failure("CUSTOM_FILE_STORAGE_KEY_INVALID", "La ruta privada no es válida.", 500);
  }
  const candidate = resolve(root, storageKey);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    throw failure("CUSTOM_FILE_STORAGE_KEY_INVALID", "La ruta privada no es válida.", 500);
  }
  return candidate;
}

function validateContent(buffer, mimeType) {
  const png = buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer.length >= 4
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer.at(-2) === 0xff
    && buffer.at(-1) === 0xd9;
  const webp = buffer.length >= 16
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP";
  const pdf = buffer.length >= 12
    && /^%PDF-1\.[0-9]/.test(buffer.toString("ascii", 0, 8))
    && buffer.subarray(Math.max(0, buffer.length - 2048)).includes(Buffer.from("%%EOF", "ascii"));

  const detected = png ? "image/png"
    : jpeg ? "image/jpeg"
      : webp ? "image/webp"
        : pdf ? "application/pdf"
          : null;

  if (!detected) {
    throw failure(
      "CUSTOM_FILE_CONTENT_INVALID",
      "El archivo no contiene una imagen o un PDF válido."
    );
  }
  if (detected !== mimeType) {
    throw failure(
      "CUSTOM_FILE_TYPE_MISMATCH",
      "El contenido real no coincide con el tipo de archivo declarado.",
      422,
      { detectedMimeType: detected }
    );
  }
}

function rangeFromHeader(value, sizeBytes) {
  if (!value) return null;
  const match = String(value).match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) {
    throw failure("CUSTOM_FILE_RANGE_INVALID", "El rango solicitado no es válido.", 416);
  }
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number.parseInt(match[2], 10);
    if (!Number.isInteger(suffix) || suffix <= 0) {
      throw failure("CUSTOM_FILE_RANGE_INVALID", "El rango solicitado no es válido.", 416);
    }
    start = Math.max(0, sizeBytes - suffix);
    end = sizeBytes - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    end = match[2] ? Number.parseInt(match[2], 10) : sizeBytes - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= sizeBytes || end < start) {
    throw failure("CUSTOM_FILE_RANGE_INVALID", "El rango solicitado no es válido.", 416);
  }
  return { start, end: Math.min(end, sizeBytes - 1) };
}

export function createCustomRequestFileStorage({
  rootPath = process.env.STORAGE_PATH ?? "/data/media"
} = {}) {
  const root = resolve(rootPath);
  const temporaryRoot = resolve(root, ".tmp-custom-requests");
  let readyPromise;

  async function ensureReady() {
    readyPromise ??= Promise.all([
      mkdir(root, { recursive: true, mode: 0o750 }),
      mkdir(temporaryRoot, { recursive: true, mode: 0o750 })
    ]);
    await readyPromise;
  }

  return Object.freeze({
    buildStorageKey({ providerId, requestId, fileId, mimeType }) {
      const extension = EXTENSIONS[mimeType];
      if (!extension) {
        throw failure("CUSTOM_FILE_TYPE_NOT_ALLOWED", "El tipo de archivo no está permitido.", 415);
      }
      for (const [field, value] of Object.entries({ providerId, requestId, fileId })) {
        if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
          throw failure("CUSTOM_FILE_STORAGE_KEY_INVALID", `${field} no es válido.`, 500);
        }
      }
      return `providers/${providerId}/custom-requests/${requestId}/${fileId}/original.${extension}`;
    },

    async write({ stream, storageKey, expectedBytes, mimeType }) {
      await ensureReady();
      if (!stream || typeof stream.pipe !== "function") {
        throw new TypeError("La carga necesita un flujo de entrada.");
      }
      if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > 12 * 1024 * 1024) {
        throw failure("CUSTOM_FILE_SIZE_INVALID", "El archivo debe ocupar como máximo 12 MB.", 413);
      }
      if (!EXTENSIONS[mimeType]) {
        throw failure("CUSTOM_FILE_TYPE_NOT_ALLOWED", "El tipo de archivo no está permitido.", 415);
      }

      const finalPath = safeAbsolute(root, storageKey);
      const temporaryPath = resolve(temporaryRoot, `${randomUUID()}.upload`);
      const hash = createHash("sha256");
      let written = 0;
      const counter = new Transform({
        transform(chunk, _encoding, callback) {
          written += chunk.length;
          if (written > expectedBytes) {
            callback(failure("CUSTOM_FILE_SIZE_MISMATCH", "La carga supera el tamaño declarado.", 400));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        }
      });

      try {
        await pipeline(stream, counter, createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }));
        if (written !== expectedBytes) {
          throw failure("CUSTOM_FILE_SIZE_MISMATCH", "La carga no coincide con el tamaño declarado.", 400);
        }
        const buffer = await readFile(temporaryPath);
        validateContent(buffer, mimeType);
        await mkdir(dirname(finalPath), { recursive: true, mode: 0o750 });
        await rename(temporaryPath, finalPath);
        return {
          storageKey,
          sizeBytes: written,
          checksumSha256: hash.digest("hex")
        };
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => {});
        await rm(finalPath, { force: true }).catch(() => {});
        if (error instanceof ServiceError) throw error;
        throw failure("CUSTOM_FILE_STORAGE_FAILED", "No se ha podido guardar el archivo.", 500);
      }
    },

    async remove(storageKey) {
      await ensureReady();
      const filePath = safeAbsolute(root, storageKey);
      await rm(filePath, { force: true });
      await rm(dirname(filePath), { recursive: true, force: true }).catch(() => {});
    },

    async openRead(storageKey, rangeHeader) {
      await ensureReady();
      const filePath = safeAbsolute(root, storageKey);
      let fileStats;
      try {
        fileStats = await stat(filePath);
      } catch (error) {
        if (error?.code === "ENOENT") {
          throw failure("CUSTOM_FILE_NOT_FOUND", "El archivo privado no está disponible.", 404);
        }
        throw error;
      }
      if (!fileStats.isFile()) {
        throw failure("CUSTOM_FILE_NOT_FOUND", "El archivo privado no está disponible.", 404);
      }
      const range = rangeFromHeader(rangeHeader, fileStats.size);
      if (!range) {
        return {
          stream: createReadStream(filePath),
          statusCode: 200,
          sizeBytes: fileStats.size,
          start: 0,
          end: fileStats.size - 1
        };
      }
      return {
        stream: createReadStream(filePath, { start: range.start, end: range.end }),
        statusCode: 206,
        sizeBytes: fileStats.size,
        start: range.start,
        end: range.end
      };
    }
  });
}
