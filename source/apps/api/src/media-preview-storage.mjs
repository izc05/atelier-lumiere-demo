import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import sharp from "sharp";
import { ServiceError } from "./providers-service.mjs";

const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;

function previewError(code, message, statusCode = 500) {
  return new ServiceError(code, message, statusCode);
}

function previewKeyForOriginal(storageKey) {
  const previewKey = String(storageKey).replace(/\/original\.[a-z0-9]+$/i, "/preview.webp");
  if (previewKey === storageKey) {
    throw previewError("MEDIA_PREVIEW_KEY_INVALID", "No se ha podido crear la ruta de previsualización.");
  }
  return previewKey;
}

function safeAbsolute(rootPath, storageKey) {
  const candidate = resolve(rootPath, storageKey);
  if (!candidate.startsWith(`${rootPath}${sep}`)) {
    throw previewError("MEDIA_PREVIEW_KEY_INVALID", "La ruta de previsualización no es válida.");
  }
  return candidate;
}

export function createMediaPreviewStorage({
  baseStorage,
  previewMaxWidth = 640,
  previewMaxHeight = 640,
  previewQuality = 82
} = {}) {
  if (!baseStorage || typeof baseStorage.write !== "function" || !baseStorage.rootPath) {
    throw new TypeError("createMediaPreviewStorage necesita almacenamiento local base.");
  }
  if (
    !Number.isInteger(previewMaxWidth)
    || !Number.isInteger(previewMaxHeight)
    || previewMaxWidth < 64
    || previewMaxWidth > 1280
    || previewMaxHeight < 64
    || previewMaxHeight > 1280
  ) {
    throw new TypeError("Las dimensiones de previsualización no son válidas.");
  }
  if (!Number.isInteger(previewQuality) || previewQuality < 50 || previewQuality > 95) {
    throw new TypeError("La calidad WebP debe estar entre 50 y 95.");
  }

  const rootPath = resolve(baseStorage.rootPath);

  return Object.freeze({
    rootPath,

    buildStorageKey(input) {
      return baseStorage.buildStorageKey(input);
    },

    async write(input) {
      const stored = await baseStorage.write(input);
      if (stored.mimeType === "video/mp4") {
        return {
          ...stored,
          previewStorageKey: null,
          previewMimeType: null,
          previewSizeBytes: null,
          previewChecksumSha256: null,
          previewWidth: null,
          previewHeight: null
        };
      }

      const previewStorageKey = previewKeyForOriginal(stored.storageKey);
      const originalPath = safeAbsolute(rootPath, stored.storageKey);
      const previewPath = safeAbsolute(rootPath, previewStorageKey);
      const temporaryPath = `${previewPath}.${randomUUID()}.tmp`;

      try {
        const { data, info } = await sharp(originalPath, {
          limitInputPixels: 40_000_000,
          failOn: "warning",
          sequentialRead: true
        })
          .rotate()
          .resize({
            width: previewMaxWidth,
            height: previewMaxHeight,
            fit: "inside",
            withoutEnlargement: true
          })
          .webp({
            quality: previewQuality,
            effort: 4,
            smartSubsample: true
          })
          .toBuffer({ resolveWithObject: true });

        if (
          !Number.isInteger(info.width)
          || !Number.isInteger(info.height)
          || info.width < 1
          || info.height < 1
          || data.length < 1
          || data.length > MAX_PREVIEW_BYTES
        ) {
          throw previewError("MEDIA_PREVIEW_INVALID", "La previsualización generada no es válida.");
        }

        await writeFile(temporaryPath, data, { flag: "wx", mode: 0o600 });
        await rename(temporaryPath, previewPath);
        const persisted = await readFile(previewPath);

        return {
          ...stored,
          previewStorageKey,
          previewMimeType: "image/webp",
          previewSizeBytes: persisted.length,
          previewChecksumSha256: createHash("sha256").update(persisted).digest("hex"),
          previewWidth: info.width,
          previewHeight: info.height
        };
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => {});
        await baseStorage.remove(stored.storageKey).catch(() => {});
        if (error instanceof ServiceError) throw error;
        throw previewError("MEDIA_PREVIEW_FAILED", "No se ha podido generar la previsualización.");
      }
    },

    async remove(storageKey) {
      return baseStorage.remove(storageKey);
    },

    async openRead(storageKey, rangeHeader) {
      return baseStorage.openRead(storageKey, rangeHeader);
    },

    async openPreview(previewStorageKey, rangeHeader) {
      return baseStorage.openRead(previewStorageKey, rangeHeader);
    }
  });
}
