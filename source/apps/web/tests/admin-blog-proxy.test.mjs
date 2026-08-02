import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAdminBlogWebHandler } from "../src/admin-blog-proxy.mjs";

const ADMIN_TOKEN = "admin-blog-proxy-token-atelier-0000000000000001";
const SESSION_COOKIE = "atelier_admin_session=admin-session-valid";
const POST_ID = "30000000-0000-4000-8000-000000000001";
const MEDIA_ID = "40000000-0000-4000-8000-000000000001";

async function startServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
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
  response.end("<h1>Revisión del blog</h1>");
}

test("la revisión del blog reutiliza la sesión y oculta el token interno", async (t) => {
  const observed = [];
  const preview = Buffer.from("RIFF1234WEBPadmin-blog-private-preview", "ascii");
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
    if (request.url === "/api/admin/blog-posts?status=IN_REVIEW") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ posts: [{ id: POST_ID, title: "Historia artesanal" }] }));
      return;
    }
    if (request.url === `/api/admin/blog-posts/${POST_ID}/review` && request.method === "POST") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "APPROVED" }));
      return;
    }
    if (request.url === `/api/admin/blog-posts/${POST_ID}/media/${MEDIA_ID}/preview`) {
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

  const web = await startServer(createAdminBlogWebHandler({
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

  const blockedPage = await fetch(`${web.baseUrl}/admin/publicaciones/`, { redirect: "manual" });
  assert.equal(blockedPage.status, 302);
  assert.equal(blockedPage.headers.get("location"), "/admin/proveedores/");

  const allowedPage = await fetch(`${web.baseUrl}/admin/publicaciones/`, {
    headers: { Cookie: SESSION_COOKIE }
  });
  assert.equal(allowedPage.status, 200);
  assert.match(await allowedPage.text(), /Revisión del blog/);

  const blockedApi = await fetch(`${web.baseUrl}/internal/admin/blog-posts?status=IN_REVIEW`);
  assert.equal(blockedApi.status, 401);

  const list = await fetch(`${web.baseUrl}/internal/admin/blog-posts?status=IN_REVIEW`, {
    headers: { Cookie: SESSION_COOKIE }
  });
  const listPayload = await list.json();
  assert.equal(list.status, 200);
  assert.equal(listPayload.posts[0].title, "Historia artesanal");
  assert.equal(JSON.stringify(listPayload).includes(ADMIN_TOKEN), false);
  assert.equal(list.headers.has("authorization"), false);

  const decisionBody = {
    decision: "APPROVED",
    reviewerNote: "Historia y portada correctas."
  };
  const decision = await fetch(`${web.baseUrl}/internal/admin/blog-posts/${POST_ID}/review`, {
    method: "POST",
    headers: { Cookie: SESSION_COOKIE, "Content-Type": "application/json" },
    body: JSON.stringify(decisionBody)
  });
  assert.equal(decision.status, 200);
  assert.equal((await decision.json()).status, "APPROVED");
  const observedDecision = observed.find((item) => item.url.endsWith("/review"));
  assert.equal(observedDecision.authorization, `Bearer ${ADMIN_TOKEN}`);
  assert.deepEqual(JSON.parse(observedDecision.body.toString("utf8")), decisionBody);

  const image = await fetch(
    `${web.baseUrl}/internal/admin/blog-posts/${POST_ID}/media/${MEDIA_ID}/preview`,
    {
      headers: {
        Cookie: SESSION_COOKIE,
        Range: `bytes=0-${preview.length - 1}`
      }
    }
  );
  assert.equal(image.status, 206);
  assert.equal(image.headers.get("content-type"), "image/webp");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), preview);
  const observedPreview = observed.find((item) => item.url.endsWith("/preview"));
  assert.equal(observedPreview.range, `bytes=0-${preview.length - 1}`);
});

test("la revisión del blog desaparece cuando Administración está desactivada", async (t) => {
  const web = await startServer(createAdminBlogWebHandler({
    baseHandler: baseAdminHandler,
    apiInternalUrl: "http://127.0.0.1:9",
    apiAdminToken: ADMIN_TOKEN,
    enableAdminUi: false,
    logger: { error() {} }
  }));
  t.after(() => new Promise((resolve) => web.server.close(resolve)));

  const page = await fetch(`${web.baseUrl}/admin/publicaciones/`, { redirect: "manual" });
  assert.equal(page.status, 404);
  const api = await fetch(`${web.baseUrl}/internal/admin/blog-posts`, {
    headers: { Cookie: SESSION_COOKIE }
  });
  assert.equal(api.status, 404);
});

test("el proxy del blog rechaza métodos administrativos no previstos", async (t) => {
  let upstreamCalls = 0;
  const web = await startServer(createAdminBlogWebHandler({
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

  const invalidMethod = await fetch(`${web.baseUrl}/internal/admin/blog-posts`, {
    method: "DELETE",
    headers: { Cookie: SESSION_COOKIE }
  });
  assert.equal(invalidMethod.status, 405);
  assert.equal(upstreamCalls, 0);
});
