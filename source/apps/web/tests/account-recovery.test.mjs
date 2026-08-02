import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAccountRecoveryWebHandler } from "../src/account-recovery-proxy.mjs";

async function request(baseUrl, path, { method = "POST", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { response, payload: await response.json() };
}

test("el proxy de recuperación limita rutas y no añade credenciales", async (t) => {
  const upstream = [];
  const handler = createAccountRecoveryWebHandler({
    baseHandler(request, response) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ delegated: true }));
    },
    apiUrl: "http://api.internal:4000",
    fetchImpl: async (url, options) => {
      upstream.push({ url: String(url), options });
      return new Response(JSON.stringify({ accepted: true, delivery: "manual-development" }), {
        status: 202,
        headers: { "Content-Type": "application/json" }
      });
    },
    logger: { error() {} }
  });
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const forwarded = await request(baseUrl, "/internal/provider-recovery/password/request", {
    body: { email: "proveedor@example.test" }
  });
  assert.equal(forwarded.response.status, 202);
  assert.equal(forwarded.payload.accepted, true);
  assert.equal(upstream.length, 1);
  assert.equal(upstream[0].url, "http://api.internal:4000/api/provider-recovery/password/request");
  assert.equal(new Headers(upstream[0].options.headers).get("authorization"), null);

  const forbiddenMethod = await request(
    baseUrl,
    "/internal/provider-recovery/password/request",
    { method: "GET" }
  );
  assert.equal(forbiddenMethod.response.status, 405);

  const delegated = await request(baseUrl, "/internal/provider-recovery/unknown", {
    body: {}
  });
  assert.equal(delegated.response.status, 404);
  assert.equal(delegated.payload.delegated, true);
});

test("las pantallas de recuperación no acceden a cookies ni almacenamiento permanente", async () => {
  const paths = [
    "public/proveedor/solicitar-recuperacion/index.html",
    "public/proveedor/recuperar-clave/index.html",
    "public/proveedor/recuperar-2fa/index.html"
  ];
  for (const path of paths) {
    const html = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(html, /Atelier Lumière/);
    assert.match(html, /noindex,nofollow,noarchive/);
    assert.match(html, /\/proveedor\/recovery\.css/);
    assert.match(html, /\/proveedor\/recovery\.js/);
    assert.doesNotMatch(html, /<script[^>]*>[^<]/i);
  }

  const browser = await readFile(new URL("../public/proveedor/recovery.js", import.meta.url), "utf8");
  for (const endpoint of [
    "/internal/provider-recovery/password/request",
    "/internal/provider-recovery/password/confirm",
    "/internal/provider-recovery/two-factor/request",
    "/internal/provider-recovery/two-factor/confirm"
  ]) assert.ok(browser.includes(endpoint));
  assert.ok(browser.includes("sessionStorage.setItem(TWO_FACTOR_SESSION_KEY"));
  for (const forbidden of [
    "localStorage",
    "document.cookie",
    "Authorization",
    "DEV_ADMIN_TOKEN",
    "WEB_ADMIN_ACCESS_KEY",
    "innerHTML"
  ]) assert.equal(browser.includes(forbidden), false);
});
