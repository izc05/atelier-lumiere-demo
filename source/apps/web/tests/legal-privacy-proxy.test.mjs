import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createLegalPrivacyWebHandler } from "../src/legal-privacy-proxy.mjs";

async function start(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

test("el proxy legal guarda una clave HttpOnly y no la expone", async (t) => {
  const observed = [];
  const upstream = await start(async (request, response) => {
    const requestBody = await body(request);
    observed.push({
      url: request.url,
      method: request.method,
      key: request.headers["x-privacy-key"],
      authorization: request.headers.authorization,
      body: requestBody
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    if (request.url === "/api/legal/documents") {
      response.end(JSON.stringify({ documents: [{ slug: "privacidad", title: "Privacidad" }] }));
      return;
    }
    response.end(JSON.stringify({
      preferences: {
        keyExists: Boolean(request.headers["x-privacy-key"]),
        necessary: true,
        preferences: requestBody.includes('"preferences":true'),
        analytics: false,
        marketing: false,
        version: request.method === "PUT" ? 1 : 0
      }
    }));
  });
  const web = await start(createLegalPrivacyWebHandler({
    apiInternalUrl: upstream.baseUrl,
    cookieSecure: false,
    logger: { error() {} },
    baseHandler(_request, response) {
      response.writeHead(404);
      response.end();
    }
  }));
  t.after(async () => {
    await Promise.all([
      new Promise((resolve) => upstream.server.close(resolve)),
      new Promise((resolve) => web.server.close(resolve))
    ]);
  });

  const documents = await fetch(`${web.baseUrl}/internal/legal/documents`);
  assert.equal(documents.status, 200);
  assert.equal((await documents.json()).documents[0].title, "Privacidad");
  assert.equal(observed[0].authorization, undefined);
  assert.equal(observed[0].key, undefined);

  const defaultPreferences = await fetch(`${web.baseUrl}/internal/privacy/preferences`);
  assert.equal(defaultPreferences.status, 200);
  assert.equal((await defaultPreferences.json()).preferences.keyExists, false);

  const blocked = await fetch(`${web.baseUrl}/internal/privacy/preferences`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "cross-site"
    },
    body: JSON.stringify({ preferences: true })
  });
  assert.equal(blocked.status, 403);

  const saved = await fetch(`${web.baseUrl}/internal/privacy/preferences`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin"
    },
    body: JSON.stringify({ preferences: true, analytics: false, marketing: false })
  });
  const savedPayload = await saved.json();
  const setCookie = saved.headers.get("set-cookie");
  assert.equal(saved.status, 200);
  assert.match(setCookie, /^atelier_privacy_key=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Max-Age=31536000/);
  assert.equal(savedPayload.preferences.preferences, true);

  const rawCookie = setCookie.split(";", 1)[0];
  const rawKey = decodeURIComponent(rawCookie.split("=", 2)[1]);
  assert.match(rawKey, /^[A-Za-z0-9_-]{32,180}$/);
  assert.equal(JSON.stringify(savedPayload).includes(rawKey), false);
  const savedRequest = observed.find((item) => item.method === "PUT");
  assert.equal(savedRequest.key, rawKey);
  assert.equal(savedRequest.authorization, undefined);

  const restored = await fetch(`${web.baseUrl}/internal/privacy/preferences`, {
    headers: { Cookie: rawCookie }
  });
  assert.equal(restored.status, 200);
  assert.equal(observed.at(-1).key, rawKey);
});

test("el proxy legal rechaza métodos y cuerpos no permitidos", async (t) => {
  let baseCalled = false;
  const web = await start(createLegalPrivacyWebHandler({
    apiInternalUrl: "http://127.0.0.1:9",
    logger: { error() {} },
    baseHandler(_request, response) {
      baseCalled = true;
      response.writeHead(404);
      response.end();
    }
  }));
  t.after(() => new Promise((resolve) => web.server.close(resolve)));

  const method = await fetch(`${web.baseUrl}/internal/legal/documents`, { method: "POST" });
  assert.equal(method.status, 405);
  assert.equal(baseCalled, false);

  const contentType = await fetch(`${web.baseUrl}/internal/privacy/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: "preferences=true"
  });
  assert.equal(contentType.status, 415);
});
