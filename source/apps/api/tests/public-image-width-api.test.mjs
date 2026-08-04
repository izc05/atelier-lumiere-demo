import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";
import { createPublicBlogApiHandler } from "../src/public-blog-api.mjs";
import { createPublicCatalogApiHandler } from "../src/public-catalog-api.mjs";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const BYTES = Buffer.from("RIFF1234WEBPvariant", "ascii");

function opened() {
  return {
    stream: Readable.from(BYTES),
    statusCode: 200,
    sizeBytes: BYTES.length,
    start: 0,
    end: BYTES.length - 1,
    mimeType: "image/webp",
    filename: "preview.webp"
  };
}

async function withServer(handler, callback) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("el catálogo transmite la anchura permitida y usa caché inmutable", async () => {
  let receivedRange;
  const handler = createPublicCatalogApiHandler({
    baseHandler(_request, response) {
      response.writeHead(404).end();
    },
    publicCatalogService: {
      async openMedia(_productId, _mediaId, variant, rangeRequest) {
        assert.equal(variant, "preview");
        receivedRange = rangeRequest;
        return opened();
      }
    },
    logger: { error() {} }
  });

  await withServer(handler, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/catalog/products/${PRODUCT_ID}/media/${MEDIA_ID}/preview?width=320`
    );
    assert.equal(response.status, 200);
    assert.deepEqual(receivedRange, { range: undefined, width: 320 });
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");

    const invalid = await fetch(
      `${baseUrl}/api/catalog/products/${PRODUCT_ID}/media/${MEDIA_ID}/preview?width=500`
    );
    assert.equal(invalid.status, 422);
    const payload = await invalid.json();
    assert.equal(payload.error, "MEDIA_PREVIEW_WIDTH_INVALID");
  });
});

test("el blog transmite la anchura permitida y usa caché inmutable", async () => {
  let receivedRange;
  const handler = createPublicBlogApiHandler({
    baseHandler(_request, response) {
      response.writeHead(404).end();
    },
    publicBlogService: {
      async openPreview(_postId, _mediaId, rangeRequest) {
        receivedRange = rangeRequest;
        return opened();
      }
    },
    logger: { error() {} }
  });

  await withServer(handler, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/blog/posts/${POST_ID}/media/${MEDIA_ID}/preview?width=960`
    );
    assert.equal(response.status, 200);
    assert.deepEqual(receivedRange, { range: undefined, width: 960 });
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  });
});
