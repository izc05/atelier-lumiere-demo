import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createProviderBlogWebHandler } from "../src/provider-blog-proxy.mjs";

const VALID_TOKEN = "provider-blog-session-atelier-000000000000000001";
const INVALID_TOKEN = "provider-blog-session-atelier-000000000000000099";
const POST_ID = "30000000-0000-4000-8000-000000000001";

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
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`
  };
}

test("el proxy del blog protege páginas y oculta el Bearer", async (t) => {
  const observed = [];
  const upstream = await startServer(async (request, response) => {
    const body = await readBody(request);
    observed.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      contentType: request.headers["content-type"],
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

    if (request.url === "/api/provider/blog-posts" && request.method === "GET") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ posts: [{ id: POST_ID, title: "Historia artesanal" }] }));
      return;
    }

    if (request.url === "/api/provider/blog-posts" && request.method === "POST") {
      response.writeHead(201, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ post: { id: POST_ID, status: "DRAFT" } }));
      return;
    }

    if (request.url === `/api/provider/blog-posts/${POST_ID}/tags` && request.method === "PUT") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ tags: ["hecho-a-mano"] }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  });

  const baseCalls = [];
  const web = await startServer(createProviderBlogWebHandler({
    apiInternalUrl: upstream.baseUrl,
    providerCookieSecure: false,
    baseHandler(request, response) {
      baseCalls.push(request.url);
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<h1>Mis publicaciones</h1>");
    },
    logger: { error() {} }
  }));

  t.after(async () => {
    await Promise.all([
      new Promise((resolve) => web.server.close(resolve)),
      new Promise((resolve) => upstream.server.close(resolve))
    ]);
  });

  const withoutCookie = await fetch(`${web.baseUrl}/proveedor/publicaciones/`, {
    redirect: "manual"
  });
  assert.equal(withoutCookie.status, 302);
  assert.equal(withoutCookie.headers.get("location"), "/proveedor/acceso/");
  assert.match(withoutCookie.headers.get("set-cookie"), /HttpOnly/);
  assert.match(withoutCookie.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(baseCalls.length, 0);

  const protectedPage = await fetch(`${web.baseUrl}/proveedor/publicaciones/`, {
    headers: { Cookie: cookie(VALID_TOKEN) }
  });
  assert.equal(protectedPage.status, 200);
  assert.match(await protectedPage.text(), /Mis publicaciones/);
  assert.deepEqual(baseCalls, ["/proveedor/publicaciones/"]);
  assert.ok(observed.some((item) => (
    item.url === "/api/provider/me"
    && item.authorization === `Bearer ${VALID_TOKEN}`
  )));

  const noCookie = await fetch(`${web.baseUrl}/internal/provider/blog-posts`);
  assert.equal(noCookie.status, 401);

  const list = await fetch(`${web.baseUrl}/internal/provider/blog-posts`, {
    headers: { Cookie: cookie(VALID_TOKEN) }
  });
  const listPayload = await list.json();
  assert.equal(list.status, 200);
  assert.equal(listPayload.posts[0].title, "Historia artesanal");
  assert.equal(JSON.stringify(listPayload).includes(VALID_TOKEN), false);
  assert.equal(list.headers.has("authorization"), false);

  const createBody = Buffer.from(JSON.stringify({
    title: "Historia artesanal",
    excerpt: "",
    bodyMarkdown: "",
    category: "Procesos"
  }));
  const created = await fetch(`${web.baseUrl}/internal/provider/blog-posts`, {
    method: "POST",
    headers: {
      Cookie: cookie(VALID_TOKEN),
      "Content-Type": "application/json",
      "Content-Length": String(createBody.length)
    },
    body: createBody
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).post.id, POST_ID);
  const observedCreate = observed.find((item) => (
    item.url === "/api/provider/blog-posts" && item.method === "POST"
  ));
  assert.ok(observedCreate);
  assert.equal(observedCreate.authorization, `Bearer ${VALID_TOKEN}`);
  assert.equal(observedCreate.contentType, "application/json");
  assert.deepEqual(observedCreate.body, createBody);

  const tagsBody = Buffer.from(JSON.stringify({ tags: ["hecho-a-mano"] }));
  const tags = await fetch(
    `${web.baseUrl}/internal/provider/blog-posts/${POST_ID}/tags`,
    {
      method: "PUT",
      headers: {
        Cookie: cookie(VALID_TOKEN),
        "Content-Type": "application/json",
        "Content-Length": String(tagsBody.length)
      },
      body: tagsBody
    }
  );
  assert.equal(tags.status, 200);
  assert.deepEqual((await tags.json()).tags, ["hecho-a-mano"]);

  const rejected = await fetch(`${web.baseUrl}/internal/provider/blog-posts`, {
    headers: { Cookie: cookie(INVALID_TOKEN) }
  });
  assert.equal(rejected.status, 401);
  assert.match(rejected.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(JSON.stringify(await rejected.json()).includes(INVALID_TOKEN), false);
});

test("el proxy del blog rechaza rutas y métodos no previstos", async (t) => {
  let baseCalled = false;
  const web = await startServer(createProviderBlogWebHandler({
    apiInternalUrl: "http://127.0.0.1:9",
    baseHandler(_request, response) {
      baseCalled = true;
      response.writeHead(404);
      response.end();
    },
    logger: { error() {} }
  }));
  t.after(() => new Promise((resolve) => web.server.close(resolve)));

  const invalidMethod = await fetch(`${web.baseUrl}/internal/provider/blog-posts`, {
    method: "DELETE",
    headers: { Cookie: cookie(VALID_TOKEN) }
  });
  assert.equal(invalidMethod.status, 405);
  assert.equal(baseCalled, false);

  const unknown = await fetch(
    `${web.baseUrl}/internal/provider/blog-posts/${POST_ID}/publish`,
    { headers: { Cookie: cookie(VALID_TOKEN) } }
  );
  assert.equal(unknown.status, 404);
  assert.equal(baseCalled, true);
});
