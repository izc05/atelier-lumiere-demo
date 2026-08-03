import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAdminRecoveryWebHandler } from "../src/admin-recovery-proxy.mjs";

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

test("el proxy de recuperación no añade credenciales administrativas", async (t) => {
  const upstream = [];
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    const headers = Object.fromEntries(new Headers(options.headers).entries());
    const body = Buffer.from(options.body ?? []).toString("utf8");
    upstream.push({ path: target.pathname, method: options.method, headers, body });

    if (target.pathname === "/api/admin-recovery/request") {
      return Response.json({ accepted: true, delivery: "manual-development" }, { status: 202 });
    }
    if (target.pathname === "/api/admin-recovery/begin") {
      return Response.json({
        account: { displayName: "Isi", role: "PLATFORM_OWNER" },
        manualKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
        qrDataUrl: "data:image/png;base64,AAAA",
        expiresAt: "2026-08-03T14:00:00.000Z"
      });
    }
    if (target.pathname === "/api/admin-recovery/confirm") {
      return Response.json({
        recovered: true,
        account: { displayName: "Isi", role: "PLATFORM_OWNER" },
        recoveryCodes: ["ABCD-EFGH-IJKL-MNOP"]
      });
    }
    throw new Error(`Ruta inesperada: ${target.pathname}`);
  };

  const handler = createAdminRecoveryWebHandler({
    enableAdminUi: true,
    apiInternalUrl: "http://api:4000",
    fetchImpl,
    logger: { error() {} },
    baseHandler(_request, response) {
      response.writeHead(404);
      response.end();
    }
  });
  const app = await start(handler);
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const requestResponse = await fetch(`${app.baseUrl}/internal/admin-recovery/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.test" })
  });
  assert.equal(requestResponse.status, 202);
  assert.equal((await json(requestResponse)).accepted, true);

  const beginResponse = await fetch(`${app.baseUrl}/internal/admin-recovery/begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "token-de-un-solo-uso-con-mas-de-treinta-y-dos-caracteres" })
  });
  assert.equal(beginResponse.status, 200);
  assert.match((await json(beginResponse)).qrDataUrl, /^data:image\/png/);

  const confirmResponse = await fetch(`${app.baseUrl}/internal/admin-recovery/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: "token-de-un-solo-uso-con-mas-de-treinta-y-dos-caracteres",
      password: "Nueva contraseña robusta 2026",
      code: "123456"
    })
  });
  assert.equal(confirmResponse.status, 200);
  assert.equal((await json(confirmResponse)).recovered, true);

  assert.equal(upstream.length, 3);
  for (const item of upstream) {
    assert.equal(item.method, "POST");
    assert.equal(item.headers.authorization, undefined);
    assert.equal(item.headers.cookie, undefined);
  }
  assert.equal(JSON.stringify(upstream).includes("DEV_ADMIN_TOKEN"), false);
  assert.equal(JSON.stringify(upstream).includes("WEB_ADMIN_ACCESS_KEY"), false);

  const beforeCrossSite = upstream.length;
  const crossSite = await fetch(`${app.baseUrl}/internal/admin-recovery/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "cross-site"
    },
    body: JSON.stringify({ email: "admin@example.test" })
  });
  assert.equal(crossSite.status, 403);
  assert.equal(upstream.length, beforeCrossSite);

  const wrongType = await fetch(`${app.baseUrl}/internal/admin-recovery/request`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "admin@example.test"
  });
  assert.equal(wrongType.status, 415);
});

test("la recuperación administrativa desaparece si la interfaz está desactivada", async () => {
  const app = await start(createAdminRecoveryWebHandler({
    enableAdminUi: false,
    baseHandler(_request, response) {
      response.writeHead(404);
      response.end();
    },
    fetchImpl: async () => {
      throw new Error("No debe llamar a la API.");
    }
  }));
  try {
    const response = await fetch(`${app.baseUrl}/internal/admin-recovery/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.test" })
    });
    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
