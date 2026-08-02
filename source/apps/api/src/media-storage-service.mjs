import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, open } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ServiceError } from "./providers-service.mjs";

const MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4"
});

const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_DIMENSION = 20_000;
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf
]);
const MP4_BRANDS = new Set([
  "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "iso7", "iso8", "iso9",
  "mp41", "mp42", "avc1", "dash", "M4V ", "MSNV"
]);

function storageError(code, message, statusCode = 422, details) {
  return new ServiceError(code, message, statusCode, details);
}

function safeAbsolute(rootPath, storageKey) {
  if (typeof storageKey !== "string" || !/^[a-z0-9/_-]+\.[a-z0-9]+$/i.test(storageKey)) {
    throw storageError("MEDIA_STORAGE_KEY_INVALID", "La ruta privada del archivo no es válida.", 500);
  }
  const candidate = resolve(rootPath, storageKey);
  if (candidate !== rootPath && !candidate.startsWith(`${rootPath}${sep}`)) {
    throw storageError("MEDIA_STORAGE_KEY_INVALID", "La ruta privada del archivo no es válida.", 500);
  }
  return candidate;
}

function pngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
  if (buffer.readUInt32BE(8) !== 13 || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return {
    mimeType: "image/png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return null;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      return {
        mimeType: "image/jpeg",
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5)
      };
    }
    offset += segmentLength;
  }
  return null;
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function webpDimensions(buffer) {
  if (
    buffer.length < 30
    || buffer.toString("ascii", 0, 4) !== "RIFF"
    || buffer.toString("ascii", 8, 12) !== "WEBP"
  ) return null;

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.length >= 30) {
    return {
      mimeType: "image/webp",
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1
    };
  }
  if (
    chunk === "VP8 "
    && buffer.length >= 30
    && buffer[23] === 0x9d
    && buffer[24] === 0x01
    && buffer[25] === 0x2a
  ) {
    return {
      mimeType: "image/webp",
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    return {
      mimeType: "image/webp",
      width: 1 + (b1 | ((b2 & 0x3f) << 8)),
      height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10))
    };
  }
  return null;
}

function validateDimensions(metadata) {
  const { width, height } = metadata;
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
    || width > MAX_DIMENSION
    || height > MAX_DIMENSION
    || width * height > MAX_IMAGE_PIXELS
  ) {
    throw storageError(
      "MEDIA_DIMENSIONS_EXCEEDED",
      "La imagen tiene unas dimensiones excesivas o no válidas.",
      422,
      { maxDimension: MAX_DIMENSION, maxPixels: MAX_IMAGE_PIXELS }
    );
  }
  return metadata;
}

async function inspectImage(filePath, claimedMimeType) {
  const buffer = await readFile(filePath);
  const metadata = pngDimensions(buffer) ?? jpegDimensions(buffer) ?? webpDimensions(buffer);
  if (!metadata) {
    throw storageError("MEDIA_CONTENT_INVALID", "El archivo no contiene una imagen JPEG, PNG o WebP válida.");
  }
  if (metadata.mimeType !== claimedMimeType) {
    throw storageError(
      "MEDIA_TYPE_MISMATCH",
      "El contenido real de la imagen no coincide con el tipo declarado.",
      422,
      { detectedMimeType: metadata.mimeType }
    );
  }
  return validateDimensions({ ...metadata, durationSeconds: null });
}

function compatibleMp4Brand(value) {
  return MP4_BRANDS.has(value) || /^iso[2-9]$/.test(value);
}

async function inspectMp4(filePath, sizeBytes) {
  const handle = await open(filePath, "r");
  try {
    const length = Math.min(sizeBytes, 4096);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const header = buffer.subarray(0, bytesRead);
    if (header.length < 16 || header.toString("ascii", 4, 8) !== "ftyp") {
      throw storageError("MEDIA_CONTENT_INVALID", "El archivo no contiene un contenedor MP4 válido.");
    }
    const boxSize = header.readUInt32BE(0);
    if (boxSize < 16 || boxSize > sizeBytes || boxSize > header.length) {
      throw storageError("MEDIA_CONTENT_INVALID", "La cabecera MP4 no es válida.");
    }
    const majorBrand = header.toString("ascii", 8, 12);
    const brands = [majorBrand];
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
      brands.push(header.toString("ascii", offset, offset + 4));
    }
    if (!brands.some(compatibleMp4Brand)) {
      throw storageError("MEDIA_CONTENT_INVALID", "El vídeo no utiliza un perfil MP4 admitido.");
    }
    return {
      mimeType: "video/mp4",
      width: null,
      height: null,
      durationSeconds: null
    };
  } finally {
    await handle.close();
  }
}

function rangeFromHeader(rangeHeader, sizeBytes) {
  if (!rangeHeader) return null;
  const match = String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/);
  if (!match) throw storageError("MEDIA_RANGE_INVALID", "El rango solicitado no es válido.", 416);
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) throw storageError("MEDIA_RANGE_INVALID", "El rango solicitado no es válido.", 416);

  let start;
  let end;
  if (!rawStart) {
    const suffix = Number.parseInt(rawEnd, 10);
    if (!Number.isInteger(suffix) || suffix <= 0) {
      throw storageError("MEDIA_RANGE_INVALID", "El rango solicitado no es válido.", 416);
    }
    start = Math.max(0, sizeBytes - suffix);
    end = sizeBytes - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd ? Number.parseInt(rawEnd, 10) : sizeBytes - 1;
  }
  if (
    !Number.isInteger(start)
    || !Number.isInteger(end)
    || start < 0
    || start >= sizeBytes
    || end < start
  ) throw storageError("MEDIA_RANGE_INVALID", "El rango solicitado no es válido.", 416);
  return { start, end: Math.min(end, sizeBytes - 1) };
}

export function extensionForMimeType(mimeType) {
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw storageError("MEDIA_TYPE_NOT_ALLOWED", "El tipo de archivo no está permitido.");
  return extension;
}

export function createLocalMediaStorage({
  rootPath = process.env.STORAGE_PATH ?? "/data/media"
} = {}) {
  if (typeof rootPath !== "string" || !rootPath.trim()) {
    throw new TypeError("STORAGE_PATH debe indicar una carpeta privada.");
  }
  const root = resolve(rootPath);
  const temporaryRoot = resolve(root, ".tmp");
  let readyPromise;

  async function ensureReady() {
    readyPromise ??= Promise.all([
      mkdir(root, { recursive: true, mode: 0o750 }),
      mkdir(temporaryRoot, { recursive: true, mode: 0o750 })
    ]);
    await readyPromise;
  }

  return Object.freeze({
    rootPath: root,

    buildStorageKey({ providerId, productId, mediaId, mimeType }) {
      const extension = extensionForMimeType(mimeType);
      for (const [field, value] of Object.entries({ providerId, productId, mediaId })) {
        if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
          throw storageError("MEDIA_STORAGE_KEY_INVALID", `${field} no es válido.`, 500);
        }
      }
      return `providers/${providerId}/products/${productId}/${mediaId}/original.${extension}`;
    },

    async write({ stream, storageKey, expectedBytes, mimeType }) {
      await ensureReady();
      if (!stream || typeof stream.pipe !== "function") {
        throw new TypeError("La carga necesita un flujo de entrada.");
      }
      if (!Number.isInteger(expectedBytes) || expectedBytes < 1) {
        throw storageError("MEDIA_SIZE_INVALID", "El tamaño declarado no es válido.");
      }

      const finalPath = safeAbsolute(root, storageKey);
      const temporaryPath = resolve(temporaryRoot, `${randomUUID()}.upload`);
      const hash = createHash("sha256");
      let writtenBytes = 0;
      const counter = new Transform({
        transform(chunk, _encoding, callback) {
          writtenBytes += chunk.length;
          if (writtenBytes > expectedBytes) {
            callback(storageError("MEDIA_SIZE_MISMATCH", "La carga supera el tamaño declarado.", 400));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        }
      });

      try {
        await pipeline(
          stream,
          counter,
          createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 })
        );
        if (writtenBytes !== expectedBytes) {
          throw storageError("MEDIA_SIZE_MISMATCH", "La carga no coincide con el tamaño declarado.", 400);
        }

        const metadata = mimeType === "video/mp4"
          ? await inspectMp4(temporaryPath, writtenBytes)
          : await inspectImage(temporaryPath, mimeType);

        await mkdir(dirname(finalPath), { recursive: true, mode: 0o750 });
        await rename(temporaryPath, finalPath);
        return {
          storageKey,
          sizeBytes: writtenBytes,
          checksumSha256: hash.digest("hex"),
          ...metadata
        };
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => {});
        await rm(finalPath, { force: true }).catch(() => {});
        if (error instanceof ServiceError) throw error;
        throw storageError("MEDIA_STORAGE_FAILED", "No se ha podido guardar el archivo.", 500);
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
          throw storageError("MEDIA_FILE_NOT_FOUND", "El archivo privado no está disponible.", 404);
        }
        throw error;
      }
      if (!fileStats.isFile()) {
        throw storageError("MEDIA_FILE_NOT_FOUND", "El archivo privado no está disponible.", 404);
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
