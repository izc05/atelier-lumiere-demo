import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createPublicCatalogWebHandler } from "../src/public-catalog-proxy.mjs";

const PRODUCT_ID = "10000000-0000-4000-8000-000000000001";
const MEDIA_ID = "20000000-0000-4000-8000-000000000001";

async function startServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test("el proxy público transmite catálogo y medios sin credenciales", async (t) => {
  const observed = [];
  const preview = Buffer.from("RIFF1234WEBPpublic-proxy-preview", "ascii");
  const upstream = await startServer((request, response) => {
    observed.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.authorization,
      cookie: request.headers.cookie,
      range: request.headers.range
    });
    if (request.url === "/api/catalog/products?q=caja") {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60"
      });
      response.end(JSON.stringify({ products: [{ id: PRODUCT_ID, name: "Caja" }] }));
      return;
    }
    if (request.url === "/api/catalog/products/taller/caja") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ product: { id: PRODUCT_ID, name: "Caja" } }));
      return;
    }
    if (request.url === `/api/catalog/products/${PRODUCT_ID}/media/${MEDIA_ID}/preview`) {
      response.writeHead(206, {
        "Content-Type": "image/webp",
        "Content-Length": String(preview.length),
        "Content-Range": `bytes 0-${preview.length - 1}/${preview.length}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=300"
      });
      response.end(preview);
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  });
  const web = await startServer(createPublicCatalogWebHandler({
    baseHandler(_request, response) {
      response.writeHead(404);
      response.end();
    },
    apiInternalUrl: upstream.baseUrl,
    logger: { error() {} }
  }));
  t.after(async () => {
    await Promise.all([
      new Promise((resolve) => web.server.close(resolve)),
      new Promise((resolve) => upstream.server.close(resolve))
    ]);
  });

  const list = await fetch(`${web.baseUrl}/internal/catalog/products?q=caja`, {
    headers: { Cookie: "private=value", Authorization: "Bearer browser-secret" }
  });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).products[0].name, "Caja");

  const detail = await fetch(`${web.baseUrl}/internal/catalog/products/taller/caja`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).product.id, PRODUCT_ID);

  const image = await fetch(
    `${web.baseUrl}/internal/catalog/products/${PRODUCT_ID}/media/${MEDIA_ID}/preview`,
    { headers: { Range: `bytes=0-${preview.length - 1}` } }
  );
  assert.equal(image.status, 206);
  assert.equal(image.headers.get("content-type"), "image/webp");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), preview);

  assert.ok(observed.length >= 3);
  assert.ok(observed.every((item) => item.authorization === undefined));
  assert.ok(observed.every((item) => item.cookie === undefined));
  assert.equal(observed.find((item) => item.url.endsWith("/preview")).range, `bytes=0-${preview.length - 1}`);
});

test("el proxy público admite solo GET y rutas conocidas", async (t) => {
  let upstreamCalls = 0;
  const web = await startServer(createPublicCatalogWebHandler({
    baseHandler(_request, response) {
      response.writeHead(404);
      response.end();
    },
    apiInternalUrl: "http://127.0.0.1:9",
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("No debe llamarse");
    },
    logger: { error() {} }
  }));
  t.after(() => new Promise((resolve) => web.server.close(resolve)));

  const post = await fetch(`${web.baseUrl}/internal/catalog/products`, { method: "POST" });
  assert.equal(post.status, 405);
  const unknown = await fetch(`${web.baseUrl}/internal/catalog/private`);
  assert.equal(unknown.status, 404);
  assert.equal(upstreamCalls, 0);
});
