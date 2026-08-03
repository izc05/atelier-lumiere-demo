import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAdminAccountsWebHandler } from "../src/admin-accounts-proxy.mjs";

const TOKEN = "admin-account-session-token-with-more-than-thirty-two-characters";
const COOKIE = `atelier_admin_session=${TOKEN}`;

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

test("el proxy de cuentas conserva la sesión en HttpOnly y filtra rutas", async (t) => {
  const upstream = [];
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    const authorization = options.headers?.get?.("Authorization") ?? null;
    upstream.push({ path: target.pathname, method: options.method ?? "GET", authorization });
    assert.equal(authorization, `Bearer ${TOKEN}`);

    if (target.pathname === "/api/admin-auth/me") {
      return Response.json({
        authenticated: true,
        account: { role: "PLATFORM_OWNER", displayName: "Isi" }
      });
    }
    if (target.pathname === "/api/admin/accounts") {
      return Response.json({ accounts: [] });
    }
    if (target.pathname.endsWith("/status")) {
      return Response.json({ account: { status: "SUSPENDED" } });
    }
    if (target.pathname.endsWith("/role")) {
      return Response.json({ account: { role: "PLATFORM_OWNER" }, revokedSessions: 1 });
    }
    if (target.pathname.endsWith("/security-reset")) {
      return Response.json({
        account: { securityReady: false },
        setup: { delivery: "manual-development" }
      });
    }
    if (target.pathname.endsWith("/sessions")) {
      return Response.json({ sessions: [] });
    }
    throw new Error(`Ruta inesperada: ${target.pathname}`);
  };

  const handler = createAdminAccountsWebHandler({
    enableAdminUi: true,
    cookieSecure: true,
    apiInternalUrl: "http://api:4000",
    fetchImpl,
    logger: { error() {} },
    baseHandler(request, response) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<main>${request.url}</main>`);
    }
  });
  const app = await start(handler);
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const unauthenticatedPage = await fetch(`${app.baseUrl}/admin/cuentas/`, { redirect: "manual" });
  assert.equal(unauthenticatedPage.status, 302);
  assert.equal(unauthenticatedPage.headers.get("location"), "/admin/proveedores/");

  const authenticatedPage = await fetch(`${app.baseUrl}/admin/cuentas/`, {
    headers: { Cookie: COOKIE }
  });
  assert.equal(authenticatedPage.status, 200);

  const list = await fetch(`${app.baseUrl}/internal/admin/accounts`, {
    headers: { Cookie: COOKIE }
  });
  assert.equal(list.status, 200);
  assert.deepEqual((await json(list)).accounts, []);

  const commonHeaders = {
    Cookie: COOKIE,
    "Content-Type": "application/json",
    "Sec-Fetch-Site": "same-origin"
  };
  const accountPath = `${app.baseUrl}/internal/admin/accounts/00000000-0000-4000-8000-000000000106`;

  const status = await fetch(`${accountPath}/status`, {
    method: "PATCH",
    headers: commonHeaders,
    body: JSON.stringify({ status: "SUSPENDED" })
  });
  assert.equal(status.status, 200);

  const role = await fetch(`${accountPath}/role`, {
    method: "PATCH",
    headers: commonHeaders,
    body: JSON.stringify({
      role: "PLATFORM_OWNER",
      confirmation: { password: "secreta", code: "123456" }
    })
  });
  assert.equal(role.status, 200);
  assert.equal((await json(role)).account.role, "PLATFORM_OWNER");

  const reset = await fetch(`${accountPath}/security-reset`, {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify({ confirmation: { password: "secreta", code: "654321" } })
  });
  assert.equal(reset.status, 200);
  assert.equal((await json(reset)).account.securityReady, false);

  const beforeCrossSite = upstream.length;
  const blocked = await fetch(`${accountPath}/security-reset`, {
    method: "POST",
    headers: {
      ...commonHeaders,
      "Sec-Fetch-Site": "cross-site"
    },
    body: JSON.stringify({ confirmation: { password: "secreta", code: "111111" } })
  });
  assert.equal(blocked.status, 403);
  assert.equal(upstream.length, beforeCrossSite);
  assert.equal(JSON.stringify(upstream).includes("DEV_ADMIN_TOKEN"), false);
});

test("las cuentas administrativas desaparecen con la interfaz desactivada", async () => {
  const handler = createAdminAccountsWebHandler({
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
    const response = await fetch(`${app.baseUrl}/internal/admin/accounts`);
    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
