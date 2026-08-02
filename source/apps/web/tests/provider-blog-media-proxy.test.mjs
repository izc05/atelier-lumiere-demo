import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createProviderBlogWebHandler } from "../src/provider-blog-proxy.mjs";

const TOKEN = "provider-blog-media-session-000000000000000001";
const POST_ID = "30000000-0000-4000-8000-000000000001";
const MEDIA_ID = "40000000-0000-4000-8000-000000000001";
const PREVIEW = Buffer.from("RIFF1234WEBPblog-private-preview", "ascii");

function cookie(token = TOKEN) {
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

test("el proxy transmite la portada y su preview sin exponer el token", async (t) => {
  const observed = [];
  const upstream = await startServer(async (request, response) => {
    const body = await readBody(request);
    observed.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      contentType: request.headers["content-type"],
      contentLength: request.headers["content-length"],
      filename: request.headers["x-file-name"],
      altText: request.headers["x-alt-text"],
      placement: request.headers["x-media-placement"],
      range: request.headers.range,
      body
    });

    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "UNAUTHORIZED" }));
      return;
    }

    if (
      request.url === `/api/provider/blog-posts/${POST_ID}/media`
      && request.method === "POST"
    ) {
      response.writeHead(201, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        media: {
          id: MEDIA_ID,
          postId: POST_ID,
          placement: "COVER",
          status: "READY",
          previewPath: `/api/provider/blog-posts/${POST_ID}/media/${MEDIA_ID}/preview`
        }
      }));
      return;
    }

    if (
      request.url === `/api/provider/blog-posts/${POST_ID}/media/${MEDIA_ID}/preview`
      && request.method === "GET"
    ) {
      response.writeHead(206, {
        "Content-Type": "image/webp",
        "Content-Length": String(PREVIEW.length),
        "Content-Range": `bytes 0-${PREVIEW.length - 1}/${PREVIEW.length}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox"
      });
      response.end(PREVIEW);
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  });

  const web = await startServer(createProviderBlogWebHandler({
    apiInternalUrl: upstream.baseUrl,
    providerCookieSecure: false,
    baseHandler(_request, response) {
      response.writeHead(404);
      response.end();
    },
    logger: { error() {} }
  }));

  t.after(async () => {
    await Promise.all([
      new Promise((resolve) => web.server.close(resolve)),
      new Promise((resolve) => upstream.server.close(resolve))
    ]);
  });

  const bytes = Buffer.from("binary-blog-cover-content");
  const upload = await fetch(
    `${web.baseUrl}/internal/provider/blog-posts/${POST_ID}/media`,
    {
      method: "POST",
      headers: {
        Cookie: cookie(),
        "Content-Type": "image/png",
        "Content-Length": String(bytes.length),
        "X-File-Name": encodeURIComponent("portada del taller.png"),
        "X-Alt-Text": encodeURIComponent("Manos trabajando en el taller"),
        "X-Media-Placement": "COVER"
      },
      body: bytes
    }
  );
  const uploadPayload = await upload.json();
  assert.equal(upload.status, 201);
  assert.equal(uploadPayload.media.id, MEDIA_ID);
  assert.equal(JSON.stringify(uploadPayload).includes(TOKEN), false);
  assert.equal(upload.headers.has("authorization"), false);

  const observedUpload = observed.find((item) => (
    item.url === `/api/provider/blog-posts/${POST_ID}/media`
    && item.method === "POST"
  ));
  assert.ok(observedUpload);
  assert.equal(observedUpload.authorization, `Bearer ${TOKEN}`);
  assert.equal(observedUpload.contentType, "image/png");
  assert.equal(Number(observedUpload.contentLength), bytes.length);
  assert.equal(decodeURIComponent(observedUpload.filename), "portada del taller.png");
  assert.equal(decodeURIComponent(observedUpload.altText), "Manos trabajando en el taller");
  assert.equal(observedUpload.placement, "COVER");
  assert.deepEqual(observedUpload.body, bytes);

  const preview = await fetch(
    `${web.baseUrl}/internal/provider/blog-posts/${POST_ID}/media/${MEDIA_ID}/preview`,
    {
      headers: {
        Cookie: cookie(),
        Range: `bytes=0-${PREVIEW.length - 1}`
      }
    }
  );
  assert.equal(preview.status, 206);
  assert.equal(preview.headers.get("content-type"), "image/webp");
  assert.equal(preview.headers.get("accept-ranges"), "bytes");
  assert.match(preview.headers.get("content-security-policy"), /sandbox/);
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), PREVIEW);
  assert.equal(preview.headers.has("authorization"), false);

  const observedPreview = observed.find((item) => item.url.endsWith(`/${MEDIA_ID}/preview`));
  assert.equal(observedPreview.authorization, `Bearer ${TOKEN}`);
  assert.equal(observedPreview.range, `bytes=0-${PREVIEW.length - 1}`);
});

test("el proxy multimedia rechaza métodos no previstos", async (t) => {
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

  const invalid = await fetch(
    `${web.baseUrl}/internal/provider/blog-posts/${POST_ID}/media/${MEDIA_ID}/preview`,
    { method: "POST", headers: { Cookie: cookie() } }
  );
  assert.equal(invalid.status, 405);
  assert.equal(baseCalled, false);
});
