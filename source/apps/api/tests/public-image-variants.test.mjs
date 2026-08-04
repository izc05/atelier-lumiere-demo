import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import sharp from "sharp";
import { createMediaPreviewStorage } from "../src/media-preview-storage.mjs";
import { createLocalMediaStorage } from "../src/media-storage-service.mjs";

async function streamBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("genera y abre previews WebP de 320, 640 y 960 píxeles", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "atelier-public-images-"));
  try {
    const baseStorage = createLocalMediaStorage({ rootPath });
    const storage = createMediaPreviewStorage({ baseStorage });
    const providerId = randomUUID();
    const productId = randomUUID();
    const mediaId = randomUUID();
    const original = await sharp({
      create: {
        width: 1400,
        height: 900,
        channels: 3,
        background: { r: 120, g: 64, b: 82 }
      }
    }).png().toBuffer();
    const storageKey = storage.buildStorageKey({
      providerId,
      productId,
      mediaId,
      mimeType: "image/png"
    });

    const stored = await storage.write({
      stream: Readable.from(original),
      storageKey,
      expectedBytes: original.length,
      mimeType: "image/png"
    });

    assert.equal(stored.previewMimeType, "image/webp");
    assert.deepEqual(storage.previewWidths, [320, 640, 960]);

    for (const width of storage.previewWidths) {
      const opened = await storage.openPreview(stored.previewStorageKey, { width });
      const metadata = await sharp(await streamBuffer(opened.stream)).metadata();
      assert.equal(metadata.format, "webp");
      assert.ok(metadata.width <= width);
      assert.ok(metadata.height <= width);
    }

    const previewDirectory = join(rootPath, "providers", providerId, "products", productId, mediaId);
    await unlink(join(previewDirectory, "preview-960.webp"));
    const fallback = await storage.openPreview(stored.previewStorageKey, { width: 960 });
    const fallbackMetadata = await sharp(await streamBuffer(fallback.stream)).metadata();
    assert.ok(fallbackMetadata.width <= 640);

    await assert.rejects(
      () => storage.openPreview(stored.previewStorageKey, { width: 500 }),
      (error) => error?.code === "MEDIA_PREVIEW_WIDTH_INVALID"
    );

    const persisted = await readFile(join(previewDirectory, "preview-320.webp"));
    assert.ok(persisted.length > 0);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});
