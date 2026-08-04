import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import sharp from "sharp";
import { ServiceError } from "./providers-service.mjs";

const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
const DEFAULT_VARIANT_WIDTHS = Object.freeze([320, 640, 960]);

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

function variantKeyForPreview(previewStorageKey, width) {
  const key = String(previewStorageKey).replace(/\/preview\.webp$/i, `/preview-${width}.webp`);
  if (key === previewStorageKey) {
    throw previewError("MEDIA_PREVIEW_KEY_INVALID", "La ruta de la variante no es válida.");
  }
  return key;
}

function safeAbsolute(rootPath, storageKey) {
  const candidate = resolve(rootPath, storageKey);
  if (!candidate.startsWith(`${rootPath}${sep}`)) {
    throw previewError("MEDIA_PREVIEW_KEY_INVALID", "La ruta de previsualización no es válida.");
  }
  return candidate;
}

function normalizedWidths(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("Las anchuras adaptativas no son válidas.");
  }
  const widths = [...new Set(values)].sort((left, right) => left - right);
  if (widths.some((width) => !Number.isInteger(width) || width < 160 || width > 1600)) {
    throw new TypeError("Las anchuras adaptativas no son válidas.");
  }
  return Object.freeze(widths);
}

async function createPreview({ originalPath, outputPath, width, height, quality }) {
  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  try {
    const { data, info } = await sharp(originalPath, {
      limitInputPixels: 40_000_000,
      failOn: "warning",
      sequentialRead: true
    })
      .rotate()
      .resize({
        width,
        height,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({
        quality,
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
    await rename(temporaryPath, outputPath);
    return {
      data,
      width: info.width,
      height: info.height
    };
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export function createMediaPreviewStorage({
  baseStorage,
  previewMaxWidth = 640,
  previewMaxHeight = 640,
  previewQuality = 82,
  variantWidths = DEFAULT_VARIANT_WIDTHS
} = {}) {
  if (!baseStorage || typeof baseStorage.write !== "function" || !baseStorage.rootPath) {
    throw new TypeError("createMediaPreviewStorage necesita almacenamiento local base.");
  }
  if (
    !Number.isInteger(previewMaxWidth)
    || !Number.isInteger(previewMaxHeight)
    || previewMaxWidth < 64
    || previewMaxWidth > 1600
    || previewMaxHeight < 64
    || previewMaxHeight > 1600
  ) {
    throw new TypeError("Las dimensiones de previsualización no son válidas.");
  }
  if (!Number.isInteger(previewQuality) || previewQuality < 50 || previewQuality > 95) {
    throw new TypeError("La calidad WebP debe estar entre 50 y 95.");
  }

  const widths = normalizedWidths(variantWidths);
  const rootPath = resolve(baseStorage.rootPath);

  return Object.freeze({
    rootPath,
    previewWidths: widths,

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
      const generatedPaths = [];

      try {
        const main = await createPreview({
          originalPath,
          outputPath: previewPath,
          width: previewMaxWidth,
          height: previewMaxHeight,
          quality: previewQuality
        });
        generatedPaths.push(previewPath);

        for (const width of widths) {
          const variantPath = safeAbsolute(rootPath, variantKeyForPreview(previewStorageKey, width));
          await createPreview({
            originalPath,
            outputPath: variantPath,
            width,
            height: width,
            quality: previewQuality
          });
          generatedPaths.push(variantPath);
        }

        const persisted = await readFile(previewPath);
        return {
          ...stored,
          previewStorageKey,
          previewMimeType: "image/webp",
          previewSizeBytes: persisted.length,
          previewChecksumSha256: createHash("sha256").update(persisted).digest("hex"),
          previewWidth: main.width,
          previewHeight: main.height
        };
      } catch (error) {
        await Promise.all(generatedPaths.map((path) => rm(path, { force: true }).catch(() => {})));
        await baseStorage.remove(stored.storageKey).catch(() => {});
        if (error instanceof ServiceError) throw error;
        throw previewError("MEDIA_PREVIEW_FAILED", "No se han podido generar las previsualizaciones.");
      }
    },

    async remove(storageKey) {
      return baseStorage.remove(storageKey);
    },

    async openRead(storageKey, rangeHeader) {
      return baseStorage.openRead(storageKey, rangeHeader);
    },

    async openPreview(previewStorageKey, rangeHeader, requestedWidth = null) {
      if (requestedWidth === null || requestedWidth === undefined || requestedWidth === "") {
        return baseStorage.openRead(previewStorageKey, rangeHeader);
      }
      const width = Number(requestedWidth);
      if (!widths.includes(width)) {
        throw previewError("MEDIA_PREVIEW_WIDTH_INVALID", "La anchura de imagen solicitada no es válida.", 422);
      }
      const variantStorageKey = variantKeyForPreview(previewStorageKey, width);
      try {
        return await baseStorage.openRead(variantStorageKey, rangeHeader);
      } catch (error) {
        if (error?.code !== "MEDIA_FILE_NOT_FOUND") throw error;
        return baseStorage.openRead(previewStorageKey, rangeHeader);
      }
    }
  });
}
