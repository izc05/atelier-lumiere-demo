import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createProviderProductsWebHandler } from "../src/provider-products-proxy.mjs";

const VALID_TOKEN = "provider-session-proxy-atelier-000000000000000001";
const INVALID_TOKEN = "provider-session-proxy-atelier-000000000000000099";
const PRODUCT_ID = "10000000-0000-4000-8000-000000000001";
const MEDIA_ID = "20000000-0000-4000-8000-000000000001";

function cookie(token) {
  return `atelier_provider_session=${encodeURIComponent(token)}`;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function startServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

test("el proxy protege páginas y oculta el Bearer al navegador", async (t) => {
  const observed = [];
  const preview = Buffer.from("RIFF1234WEBPpreview-private-bytes", "ascii");

  const upstream = await startServer(async (request, response) => {
    const body = await readBody(request);
    observed.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      contentType: request.headers["content-type"],
      contentLength: request.headers["content-length"],
      fileName: request.headers["x-file-name"],
      altText: request.headers["x-alt-text"],
      body
    });

    if (request.headers.authorization !== `Bearer ${VALID_TOKEN}`) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "UNAUTHORIZED" }));
      return;
    }

    if (request.url === "/api/provider/me") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ authenticated: true }));
      return;
    }

    if (request.url === "/api/provider/products" && request.method === "GET") {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      });
      response.end(JSON.stringify({ products: [{ id: PRODUCT_ID, name: "Caja artesanal" }] }));
      return;
    }

    if (
      request.url === `/api/provider/products/${PRODUCT_ID}/media`
      && request.method === "POST"
    ) {
      response.writeHead(201, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        media: {
          id: MEDIA_ID,
          productId: PRODUCT_ID,
          status: "READY",
          previewPath: `/api/provider/products/${PRODUCT_ID}/media/${MEDIA_ID}/preview`
        }
      }));
      return;
    }

    if (
      request.url === `/api/provider/products/${PRODUCT_ID}/media/${MEDIA_ID}/preview`
      && request.method === "GET"
    ) {
      response.writeHead(206, {
        "Content-Type": "image/webp",
        "Content-Length": String(preview.length),
        "Content-Range": `bytes 0-${preview.length - 1}/${preview.length}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(preview);
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  });

  const baseCalls = [];
  const web = await startServer(createProviderProductsWebHandler({
    apiInternalUrl: upstream.baseUrl,
    providerCookieSecure: false,
    baseHandler(request, response) {
      baseCalls.push(request.url);
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<h1>Mis artículos</h1>");
    },
    logger: { error() {} }
  }));

  t.after(async () => {
    await Promise.all([
      new Promise((resolve) => web.server.close(resolve)),
      new Promise((resolve) => upstream.server.close(resolve))
    ]);
  });

  const withoutCookie = await fetch(`${web.baseUrl}/proveedor/articulos/`, {
    redirect: "manual"
  });
  assert.equal(withoutCookie.status, 302);
  assert.equal(withoutCookie.headers.get("location"), "/proveedor/acceso/");
  assert.match(withoutCookie.headers.get("set-cookie"), /HttpOnly/);
  assert.match(withoutCookie.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(baseCalls.length, 0);

  const protectedPage = await fetch(`${web.baseUrl}/proveedor/articulos/`, {
    headers: { Cookie: cookie(VALID_TOKEN) }
  });
  assert.equal(protectedPage.status, 200);
  assert.match(await protectedPage.text(), /Mis artículos/);
  assert.deepEqual(baseCalls, ["/proveedor/articulos/"]);
  assert.ok(observed.some((item) => (
    item.url === "/api/provider/me"
    && item.authorization === `Bearer ${VALID_TOKEN}`
  )));

  const noProxyCookie = await fetch(`${web.baseUrl}/internal/provider/products`);
  assert.equal(noProxyCookie.status, 401);
  assert.equal((await noProxyCookie.json()).error, "UNAUTHORIZED");

  const products = await fetch(`${web.baseUrl}/internal/provider/products`, {
    headers: { Cookie: cookie(VALID_TOKEN) }
  });
  const productsPayload = await products.json();
  assert.equal(products.status, 200);
  assert.equal(productsPayload.products[0].name, "Caja artesanal");
  assert.equal(JSON.stringify(productsPayload).includes(VALID_TOKEN), false);
  assert.equal(products.headers.has("authorization"), false);

  const binary = Buffer.from("binary-image-content-for-proxy-test");
  const upload = await fetch(
    `${web.baseUrl}/internal/provider/products/${PRODUCT_ID}/media`,
    {
      method: "POST",
      headers: {
        Cookie: cookie(VALID_TOKEN),
        "Content-Type": "image/png",
        "X-File-Name": encodeURIComponent("imagen prueba.png"),
        "X-Alt-Text": encodeURIComponent("Detalle artesanal")
      },
      body: binary
    }
  );
  const uploadPayload = await upload.json();
  assert.equal(upload.status, 201);
  assert.equal(uploadPayload.media.id, MEDIA_ID);
  const observedUpload = observed.find((item) => (
    item.url === `/api/provider/products/${PRODUCT_ID}/media`
    && item.method === "POST"
  ));
  assert.ok(observedUpload);
  assert.equal(observedUpload.authorization, `Bearer ${VALID_TOKEN}`);
  assert.equal(observedUpload.contentType, "image/png");
  assert.equal(Number(observedUpload.contentLength), binary.length);
  assert.equal(decodeURIComponent(observedUpload.fileName), "imagen prueba.png");
  assert.equal(decodeURIComponent(observedUpload.altText), "Detalle artesanal");
  assert.deepEqual(observedUpload.body, binary);

  const previewResponse = await fetch(
    `${web.baseUrl}/internal/provider/products/${PRODUCT_ID}/media/${MEDIA_ID}/preview`,
    {
      headers: {
        Cookie: cookie(VALID_TOKEN),
        Range: `bytes=0-${preview.length - 1}`
      }
    }
  );
  assert.equal(previewResponse.status, 206);
  assert.equal(previewResponse.headers.get("content-type"), "image/webp");
  assert.match(previewResponse.headers.get("cache-control"), /private/);
  assert.equal(previewResponse.headers.get("accept-ranges"), "bytes");
  assert.deepEqual(Buffer.from(await previewResponse.arrayBuffer()), preview);

  const rejectedSession = await fetch(`${web.baseUrl}/internal/provider/products`, {
    headers: { Cookie: cookie(INVALID_TOKEN) }
  });
  assert.equal(rejectedSession.status, 401);
  assert.match(rejectedSession.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(JSON.stringify(await rejectedSession.json()).includes(INVALID_TOKEN), false);
});

test("el proxy rechaza métodos y rutas no previstos", async (t) => {
  let baseCalled = false;
  const web = await startServer(createProviderProductsWebHandler({
    apiInternalUrl: "http://127.0.0.1:9",
    baseHandler(_request, response) {
      baseCalled = true;
      response.writeHead(404);
      response.end();
    },
    logger: { error() {} }
  }));
  t.after(() => new Promise((resolve) => web.server.close(resolve)));

  const invalidMethod = await fetch(`${web.baseUrl}/internal/provider/products`, {
    method: "DELETE",
    headers: { Cookie: cookie(VALID_TOKEN) }
  });
  assert.equal(invalidMethod.status, 405);
  assert.equal(baseCalled, false);

  const unknown = await fetch(`${web.baseUrl}/internal/provider/products/${PRODUCT_ID}/publish`, {
    headers: { Cookie: cookie(VALID_TOKEN) }
  });
  assert.equal(unknown.status, 404);
  assert.equal(baseCalled, true);
});
