import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createWebHandler } from "../src/app.mjs";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function jsonRequest(baseUrl, path, {
  method = "GET",
  body,
  cookie
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

test("el panel mantiene el token de API fuera del navegador", async (t) => {
  const apiToken = "api-internal-token-not-visible-000000000000001";
  const accessKey = "clave-web-privada-de-prueba-00000001";
  const receivedAuthorizations = [];

  const apiServer = createServer(async (request, response) => {
    receivedAuthorizations.push(request.headers.authorization ?? null);
    if (request.headers.authorization !== `Bearer ${apiToken}`) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "UNAUTHORIZED" }));
      return;
    }

    if (request.method === "GET" && request.url === "/api/admin/providers") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        providers: [{
          id: "00000000-0000-4000-8000-000000000201",
          displayName: "Taller de prueba",
          contactEmail: "taller@atelier.example",
          specialty: "Cerámica",
          status: "ACTIVE"
        }]
      }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/admin/providers") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const input = JSON.parse(raw);
      response.writeHead(201, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        provider: { id: "00000000-0000-4000-8000-000000000299", ...input, status: "INVITED" },
        invitation: { status: "PENDING" },
        activationToken: "one-time-provider-token",
        activationPath: "/proveedor/activar?token=one-time-provider-token"
      }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  });
  const apiUrl = await listen(apiServer);

  let currentTime = Date.parse("2026-08-02T10:00:00.000Z");
  const webServer = createServer(createWebHandler({
    apiInternalUrl: apiUrl,
    apiAdminToken: apiToken,
    enableAdminUi: true,
    adminAccessKey: accessKey,
    sessionTtlMs: 30 * 60 * 1000,
    now: () => currentTime,
    logger: { error() {} }
  }));
  const webUrl = await listen(webServer);

  t.after(async () => {
    await close(webServer);
    await close(apiServer);
  });

  const page = await fetch(`${webUrl}/admin/proveedores/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Atelier Lumière/);
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.equal(html.includes(apiToken), false);

  const withoutSession = await jsonRequest(webUrl, "/internal/admin/providers");
  assert.equal(withoutSession.response.status, 401);

  const invalidLogin = await jsonRequest(webUrl, "/internal/admin/session", {
    method: "POST",
    body: { accessKey: "clave-incorrecta-de-prueba-000000" }
  });
  assert.equal(invalidLogin.response.status, 401);

  const login = await jsonRequest(webUrl, "/internal/admin/session", {
    method: "POST",
    body: { accessKey }
  });
  assert.equal(login.response.status, 201);
  const setCookie = login.response.headers.get("set-cookie");
  assert.match(setCookie, /atelier_admin_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const cookie = setCookie.split(";", 1)[0];

  const list = await jsonRequest(webUrl, "/internal/admin/providers", { cookie });
  assert.equal(list.response.status, 200);
  assert.equal(list.payload.providers[0].displayName, "Taller de prueba");
  assert.equal(JSON.stringify(list.payload).includes(apiToken), false);
  assert.equal(receivedAuthorizations.at(-1), `Bearer ${apiToken}`);

  const created = await jsonRequest(webUrl, "/internal/admin/providers", {
    method: "POST",
    cookie,
    body: {
      displayName: "Nuevo taller",
      contactName: "Artesana",
      contactEmail: "artesana@atelier.example",
      specialty: "Bordado"
    }
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.provider.displayName, "Nuevo taller");
  assert.equal(created.payload.activationToken, "one-time-provider-token");
  assert.equal(JSON.stringify(created.payload).includes(apiToken), false);

  currentTime += 31 * 60 * 1000;
  const expired = await jsonRequest(webUrl, "/internal/admin/providers", { cookie });
  assert.equal(expired.response.status, 401);
});

test("el panel y el proxy desaparecen cuando no están habilitados", async (t) => {
  const server = createServer(createWebHandler({
    enableAdminUi: false,
    logger: { error() {} }
  }));
  const baseUrl = await listen(server);
  t.after(() => close(server));

  const page = await fetch(`${baseUrl}/admin/proveedores/`);
  assert.equal(page.status, 404);

  const proxy = await jsonRequest(baseUrl, "/internal/admin/providers");
  assert.equal(proxy.response.status, 404);
});
