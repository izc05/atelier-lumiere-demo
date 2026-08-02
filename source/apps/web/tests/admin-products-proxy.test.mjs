import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAdminProductsWebHandler } from "../src/admin-products-proxy.mjs";

const ADMIN_TOKEN = "admin-products-proxy-token-atelier-0000000000001";
const SESSION_COOKIE = "atelier_admin_session=admin-session-valid";
const PRODUCT_ID = "10000000-0000-4000-8000-000000000001";
const MEDIA_ID = "20000000-0000-4000-8000-000000000001";

async function startServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function baseAdminHandler(request, response) {
  if (request.url === "/internal/admin/session") {
    const valid = String(request.headers.cookie ?? "").includes("atelier_admin_session=admin-session-valid");
    response.writeHead(valid ? 200 : 401, { "Content-Type": "application/json" });
    response.end(JSON.stringify(valid ? { authenticated: true } : { error: "UNAUTHORIZED" }));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end("<h1>Revisión de artículos</h1>");
}

test("la revisión administrativa reutiliza la sesión y oculta el token interno", async (t) => {
  const observed = [];
  const preview = Buffer.from("RIFF1234WEBPadmin-private-preview", "ascii");
  const upstream = await startServer(async (request, response) => {
    const body = await readBody(request);
    observed.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.authorization,
      range: request.headers.range,
      body
    });
    if (request.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "UNAUTHORIZED" }));
      return;
    }
    if (request.url === "/api/admin/products?status=IN_REVIEW") {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ products: [{ id: PRODUCT_ID, name: "Caja artesanal" }] }));
      return;
    }
    if (request.url === `/api/admin/products/${PRODUCT_ID}/review` && request.method === "POST") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "APPROVED" }));
      return;
    }
    if (request.url === `/api/admin/products/${PRODUCT_ID}/media/${MEDIA_ID}/preview`) {
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

  const web = await startServer(createAdminProductsWebHandler({
    baseHandler: baseAdminHandler,
    apiInternalUrl: upstream.baseUrl,
    apiAdminToken: ADMIN_TOKEN,
    enableAdminUi: true,
    logger: { error() {} }
  }));
  t.after(async () => {
    await Promise.all([
      new Promise((resolve) => web.server.close(resolve)),
      new Promise((resolve) => upstream.server.close(resolve))
    ]);
  });

  const blockedPage = await fetch(`${web.baseUrl}/admin/articulos/`, { redirect: "manual" });
  assert.equal(blockedPage.status, 302);
  assert.equal(blockedPage.headers.get("location"), "/admin/proveedores/");

  const allowedPage = await fetch(`${web.baseUrl}/admin/articulos/`, {
    headers: { Cookie: SESSION_COOKIE }
  });
  assert.equal(allowedPage.status, 200);
  assert.match(await allowedPage.text(), /Revisión de artículos/);

  const blockedApi = await fetch(`${web.baseUrl}/internal/admin/products?status=IN_REVIEW`);
  assert.equal(blockedApi.status, 401);

  const list = await fetch(`${web.baseUrl}/internal/admin/products?status=IN_REVIEW`, {
    headers: { Cookie: SESSION_COOKIE }
  });
  const listPayload = await list.json();
  assert.equal(list.status, 200);
  assert.equal(listPayload.products[0].name, "Caja artesanal");
  assert.equal(JSON.stringify(listPayload).includes(ADMIN_TOKEN), false);
  assert.equal(list.headers.has("authorization"), false);

  const decision = await fetch(`${web.baseUrl}/internal/admin/products/${PRODUCT_ID}/review`, {
    method: "POST",
    headers: {
      Cookie: SESSION_COOKIE,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ decision: "APPROVED", reviewerNote: "Ficha correcta." })
  });
  assert.equal(decision.status, 200);
  assert.equal((await decision.json()).status, "APPROVED");
  const observedDecision = observed.find((item) => item.url.endsWith("/review"));
  assert.equal(observedDecision.authorization, `Bearer ${ADMIN_TOKEN}`);
  assert.deepEqual(JSON.parse(observedDecision.body.toString("utf8")), {
    decision: "APPROVED",
    reviewerNote: "Ficha correcta."
  });

  const image = await fetch(
    `${web.baseUrl}/internal/admin/products/${PRODUCT_ID}/media/${MEDIA_ID}/preview`,
    {
      headers: {
        Cookie: SESSION_COOKIE,
        Range: `bytes=0-${preview.length - 1}`
      }
    }
  );
  assert.equal(image.status, 206);
  assert.equal(image.headers.get("content-type"), "image/webp");
  assert.match(image.headers.get("cache-control"), /private/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), preview);
  const observedPreview = observed.find((item) => item.url.endsWith("/preview"));
  assert.equal(observedPreview.range, `bytes=0-${preview.length - 1}`);
});

test("el panel de revisión desaparece cuando Administración está desactivada", async (t) => {
  const web = await startServer(createAdminProductsWebHandler({
    baseHandler: baseAdminHandler,
    apiInternalUrl: "http://127.0.0.1:9",
    apiAdminToken: ADMIN_TOKEN,
    enableAdminUi: false,
    logger: { error() {} }
  }));
  t.after(() => new Promise((resolve) => web.server.close(resolve)));

  const page = await fetch(`${web.baseUrl}/admin/articulos/`, { redirect: "manual" });
  assert.equal(page.status, 404);
  const api = await fetch(`${web.baseUrl}/internal/admin/products`, {
    headers: { Cookie: SESSION_COOKIE }
  });
  assert.equal(api.status, 404);
});

test("el proxy rechaza métodos y rutas administrativas no previstas", async (t) => {
  let upstreamCalls = 0;
  const web = await startServer(createAdminProductsWebHandler({
    baseHandler: baseAdminHandler,
    apiInternalUrl: "http://127.0.0.1:9",
    apiAdminToken: ADMIN_TOKEN,
    enableAdminUi: true,
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("No debería llamarse");
    },
    logger: { error() {} }
  }));
  t.after(() => new Promise((resolve) => web.server.close(resolve)));

  const invalidMethod = await fetch(`${web.baseUrl}/internal/admin/products`, {
    method: "DELETE",
    headers: { Cookie: SESSION_COOKIE }
  });
  assert.equal(invalidMethod.status, 405);

  const invalidRoute = await fetch(`${web.baseUrl}/internal/admin/products/${PRODUCT_ID}/archive`, {
    headers: { Cookie: SESSION_COOKIE }
  });
  assert.equal(invalidRoute.status, 200);
  assert.equal(upstreamCalls, 0);
});
