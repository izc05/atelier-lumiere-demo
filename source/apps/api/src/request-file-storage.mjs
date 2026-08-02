import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
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

function storageError(code, message, statusCode = 422, details) {
  return new ServiceError(code, message, statusCode, details);
}

function safeAbsolute(rootPath, storageKey) {
  if (typeof storageKey !== "string" || !/^[a-z0-9/_-]+\.[a-z0-9]+$/i.test(storageKey)) {
    throw storageError("REQUEST_FILE_STORAGE_KEY_INVALID", "La ruta privada no es válida.", 500);
  }
  const candidate = resolve(rootPath, storageKey);
  if (candidate !== rootPath && !candidate.startsWith(`${rootPath}${sep}`)) {
    throw storageError("REQUEST_FILE_STORAGE_KEY_INVALID", "La ruta privada no es válida.", 500);
  }
  return candidate;
}

function detectedImageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function inspectFile(filePath, claimedMimeType) {
  const header = await readFile(filePath);
  if (claimedMimeType === "application/pdf") {
    if (header.length < 8 || header.toString("ascii", 0, 5) !== "%PDF-") {
      throw storageError("REQUEST_FILE_CONTENT_INVALID", "El archivo no contiene un PDF válido.");
    }
    const tail = header.subarray(Math.max(0, header.length - 2048)).toString("latin1");
    if (!tail.includes("%%EOF")) {
      throw storageError("REQUEST_FILE_CONTENT_INVALID", "El PDF está incompleto o no es válido.");
    }
    return;
  }
  const detected = detectedImageType(header);
  if (!detected) {
    throw storageError("REQUEST_FILE_CONTENT_INVALID", "El archivo no contiene una imagen válida.");
  }
  if (detected !== claimedMimeType) {
    throw storageError("REQUEST_FILE_TYPE_MISMATCH", "El contenido no coincide con el tipo declarado.", 422, { detectedMimeType: detected });
  }
}

function parseRange(rangeHeader, sizeBytes) {
  if (!rangeHeader) return null;
  const match = String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) throw storageError("REQUEST_FILE_RANGE_INVALID", "El rango no es válido.", 416);
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number.parseInt(match[2], 10);
    if (!Number.isInteger(suffix) || suffix <= 0) throw storageError("REQUEST_FILE_RANGE_INVALID", "El rango no es válido.", 416);
    start = Math.max(0, sizeBytes - suffix);
    end = sizeBytes - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    end = match[2] ? Number.parseInt(match[2], 10) : sizeBytes - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= sizeBytes) {
    throw storageError("REQUEST_FILE_RANGE_INVALID", "El rango no es válido.", 416);
  }
  return { start, end: Math.min(end, sizeBytes - 1) };
}

export function createRequestFileStorage({ rootPath = process.env.STORAGE_PATH ?? "/data/media" } = {}) {
  const root = resolve(rootPath);
  const temporaryRoot = resolve(root, ".request-files-tmp");
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
      if (!extension) throw storageError("REQUEST_FILE_TYPE_NOT_ALLOWED", "Tipo de archivo no admitido.", 415);
      for (const value of [providerId, requestId, fileId]) {
        if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw storageError("REQUEST_FILE_STORAGE_KEY_INVALID", "La ruta privada no es válida.", 500);
      }
      return `providers/${providerId}/requests/${requestId}/${fileId}/original.${extension}`;
    },
    async write({ stream, storageKey, expectedBytes, mimeType }) {
      await ensureReady();
      if (!stream || typeof stream.pipe !== "function") throw new TypeError("La carga necesita un flujo de entrada.");
      const finalPath = safeAbsolute(root, storageKey);
      const temporaryPath = resolve(temporaryRoot, `${randomUUID()}.upload`);
      const hash = createHash("sha256");
      let writtenBytes = 0;
      const counter = new Transform({ transform(chunk, _encoding, callback) {
        writtenBytes += chunk.length;
        if (writtenBytes > expectedBytes) return callback(storageError("REQUEST_FILE_SIZE_MISMATCH", "La carga supera el tamaño declarado.", 400));
        hash.update(chunk);
        callback(null, chunk);
      }});
      try {
        await pipeline(stream, counter, createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }));
        if (writtenBytes !== expectedBytes) throw storageError("REQUEST_FILE_SIZE_MISMATCH", "La carga no coincide con el tamaño declarado.", 400);
        await inspectFile(temporaryPath, mimeType);
        await mkdir(dirname(finalPath), { recursive: true, mode: 0o750 });
        await rename(temporaryPath, finalPath);
        return { storageKey, sizeBytes: writtenBytes, checksumSha256: hash.digest("hex") };
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => {});
        await rm(finalPath, { force: true }).catch(() => {});
        if (error instanceof ServiceError) throw error;
        throw storageError("REQUEST_FILE_STORAGE_FAILED", "No se ha podido guardar el archivo.", 500);
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
      try { fileStats = await stat(filePath); }
      catch (error) {
        if (error?.code === "ENOENT") throw storageError("REQUEST_FILE_NOT_FOUND", "El archivo privado no está disponible.", 404);
        throw error;
      }
      const range = parseRange(rangeHeader, fileStats.size);
      if (!range) return { stream: createReadStream(filePath), statusCode: 200, sizeBytes: fileStats.size, start: 0, end: fileStats.size - 1 };
      return { stream: createReadStream(filePath, { start: range.start, end: range.end }), statusCode: 206, sizeBytes: fileStats.size, start: range.start, end: range.end };
    }
  });
}
