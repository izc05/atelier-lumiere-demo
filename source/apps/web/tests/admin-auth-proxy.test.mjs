import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAdminAuthenticationWebHandler } from "../src/admin-auth-proxy.mjs";

const SESSION_TOKEN = "real-admin-session-token-with-more-than-thirty-two-characters";
const CHALLENGE_TOKEN = "temporary-admin-challenge-token-with-more-than-thirty-two-characters";

async function start(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function json(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

test("el BFF administrativo guarda la sesión en cookie y no filtra el token", async (t) => {
  const upstreamRequests = [];
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    const authorization = options.headers?.get?.("Authorization") ?? null;
    const body = options.body instanceof Uint8Array || Buffer.isBuffer(options.body)
      ? Buffer.from(options.body).toString("utf8")
      : null;
    upstreamRequests.push({ path: target.pathname, method: options.method, authorization, body });

    if (target.pathname === "/api/admin-auth/password") {
      return Response.json({
        challengeToken: CHALLENGE_TOKEN,
        expiresAt: "2026-08-03T12:10:00.000Z",
        methods: ["TOTP", "RECOVERY_CODE"],
        attemptsRemaining: 5,
        account: { displayName: "Isi", role: "PLATFORM_OWNER" }
      });
    }
    if (target.pathname === "/api/admin-auth/second-factor") {
      return Response.json({
        sessionToken: SESSION_TOKEN,
        expiresAt: "2026-08-03T18:00:00.000Z",
        account: {
          id: "00000000-0000-4000-8000-000000000106",
          email: "admin@example.test",
          displayName: "Isi",
          role: "PLATFORM_OWNER"
        }
      });
    }
    if (target.pathname === "/api/admin-auth/me") {
      if (authorization !== `Bearer ${SESSION_TOKEN}`) {
        return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
      }
      return Response.json({
        authenticated: true,
        account: {
          id: "00000000-0000-4000-8000-000000000106",
          email: "admin@example.test",
          displayName: "Isi",
          role: "PLATFORM_OWNER"
        },
        expiresAt: "2026-08-03T18:00:00.000Z"
      });
    }
    if (target.pathname === "/api/admin-auth/logout") {
      assert.equal(authorization, `Bearer ${SESSION_TOKEN}`);
      return Response.json({ authenticated: false });
    }
    if (target.pathname === "/api/admin/providers") {
      assert.equal(authorization, `Bearer ${SESSION_TOKEN}`);
      return Response.json({ providers: [{ id: "provider-a", displayName: "Taller A" }] });
    }
    if (target.pathname.endsWith("/preview")) {
      assert.equal(authorization, `Bearer ${SESSION_TOKEN}`);
      return new Response(Buffer.from("preview-bytes"), {
        status: 206,
        headers: {
          "Content-Type": "image/webp",
          "Content-Range": "bytes 0-12/13",
          "Accept-Ranges": "bytes"
        }
      });
    }
    throw new Error(`Ruta upstream inesperada: ${target.pathname}`);
  };

  const handler = createAdminAuthenticationWebHandler({
    enableAdminUi: true,
    cookieSecure: true,
    apiInternalUrl: "http://api:4000",
    fetchImpl,
    now: () => Date.parse("2026-08-03T10:00:00.000Z"),
    logger: { error() {} },
    baseHandler(request, response) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<main>${request.url}</main>`);
    }
  });
  const app = await start(handler);
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const protectedPage = await fetch(`${app.baseUrl}/admin/articulos/`, { redirect: "manual" });
  assert.equal(protectedPage.status, 302);
  assert.equal(protectedPage.headers.get("location"), "/admin/proveedores/");

  const loginPage = await fetch(`${app.baseUrl}/admin/proveedores/`);
  assert.equal(loginPage.status, 200);

  const passwordResponse = await fetch(`${app.baseUrl}/internal/admin-auth/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.test", password: "correcta" })
  });
  const passwordPayload = await json(passwordResponse);
  assert.equal(passwordResponse.status, 200);
  assert.equal(passwordPayload.challengeToken, CHALLENGE_TOKEN);
  assert.equal(passwordResponse.headers.get("set-cookie"), null);

  const factorResponse = await fetch(`${app.baseUrl}/internal/admin-auth/second-factor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeToken: CHALLENGE_TOKEN, code: "123456" })
  });
  const factorPayload = await json(factorResponse);
  const setCookie = factorResponse.headers.get("set-cookie");
  assert.equal(factorResponse.status, 200);
  assert.equal(factorPayload.authenticated, true);
  assert.equal(JSON.stringify(factorPayload).includes(SESSION_TOKEN), false);
  assert.match(setCookie, /atelier_admin_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Secure/);
  const cookie = setCookie.split(";", 1)[0];

  const sessionResponse = await fetch(`${app.baseUrl}/internal/admin/session`, {
    headers: { Cookie: cookie }
  });
  const sessionPayload = await json(sessionResponse);
  assert.equal(sessionResponse.status, 200);
  assert.equal(sessionPayload.account.role, "PLATFORM_OWNER");
  assert.equal(JSON.stringify(sessionPayload).includes(SESSION_TOKEN), false);

  const providersResponse = await fetch(`${app.baseUrl}/internal/admin/providers`, {
    headers: { Cookie: cookie }
  });
  assert.equal(providersResponse.status, 200);
  assert.equal((await json(providersResponse)).providers[0].displayName, "Taller A");

  const previewResponse = await fetch(
    `${app.baseUrl}/internal/admin/products/00000000-0000-4000-8000-000000000201/media/00000000-0000-4000-8000-000000000301/preview`,
    { headers: { Cookie: cookie, Range: "bytes=0-12" } }
  );
  assert.equal(previewResponse.status, 206);
  assert.equal(await previewResponse.text(), "preview-bytes");
  assert.equal(previewResponse.headers.get("content-range"), "bytes 0-12/13");

  const allowedPage = await fetch(`${app.baseUrl}/admin/articulos/`, {
    headers: { Cookie: cookie }
  });
  assert.equal(allowedPage.status, 200);

  const beforeCrossSite = upstreamRequests.length;
  const crossSite = await fetch(`${app.baseUrl}/internal/admin/providers`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "cross-site"
    },
    body: JSON.stringify({ displayName: "Bloqueado" })
  });
  assert.equal(crossSite.status, 403);
  assert.equal(upstreamRequests.length, beforeCrossSite);

  const logoutResponse = await fetch(`${app.baseUrl}/internal/admin/session`, {
    method: "DELETE",
    headers: { Cookie: cookie }
  });
  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers.get("set-cookie"), /Max-Age=0/);

  assert.equal(JSON.stringify(upstreamRequests).includes("WEB_ADMIN_ACCESS_KEY"), false);
  assert.equal(JSON.stringify(upstreamRequests).includes("DEV_ADMIN_TOKEN"), false);
});

test("el BFF administrativo desaparece cuando la interfaz está desactivada", async () => {
  const handler = createAdminAuthenticationWebHandler({
    enableAdminUi: false,
    baseHandler(_request, response) {
      response.writeHead(404);
      response.end();
    },
    fetchImpl: async () => {
      throw new Error("No debe contactar con la API.");
    }
  });
  const app = await start(handler);
  try {
    const response = await fetch(`${app.baseUrl}/internal/admin-auth/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
