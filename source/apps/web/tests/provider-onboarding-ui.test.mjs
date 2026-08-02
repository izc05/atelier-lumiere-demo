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

async function post(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return { response, payload: await response.json() };
}

test("la incorporación usa un proxy limitado sin credenciales administrativas", async (t) => {
  const received = [];
  const apiServer = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    received.push({
      method: request.method,
      path: request.url,
      authorization: request.headers.authorization ?? null,
      body: raw ? JSON.parse(raw) : null
    });

    const payloads = new Map([
      ["/api/provider-invitations/preview", { provider: { displayName: "Taller privado", specialty: "Cerámica" }, invitation: { emailMasked: "ar***@atelier.example", expiresAt: "2026-08-04T12:00:00.000Z" } }],
      ["/api/provider-invitations/accept", { verificationPath: "/proveedor/verificar-correo?token=email-token-test-000000000000000000000000000001" }],
      ["/api/email-verifications/verify", { twoFactorSetupToken: "two-factor-token-test-000000000000000000000001", twoFactorSetupExpiresAt: "2026-08-02T13:15:00.000Z", provider: { displayName: "Taller privado" } }],
      ["/api/email-verifications/resend", { verificationPath: "/proveedor/verificar-correo?token=email-token-test-000000000000000000000000000002" }],
      ["/api/two-factor/setup", { provider: { displayName: "Taller privado" }, secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/Atelier", qrDataUrl: "data:image/png;base64,AA==", attemptsRemaining: 5 }],
      ["/api/two-factor/confirm", { recoveryCodes: Array.from({ length: 10 }, (_, index) => `AAAA-BBBB-CCCC-${String(index).padStart(4, "A")}`), provider: { displayName: "Taller privado", status: "INVITED" }, user: { status: "ACTIVE" }, membership: { status: "ACTIVE" } }]
    ]);

    const payload = payloads.get(request.url);
    response.writeHead(payload ? 200 : 404, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload ?? { error: "NOT_FOUND" }));
  });
  const apiUrl = await listen(apiServer);

  const webServer = createServer(createWebHandler({
    apiInternalUrl: apiUrl,
    enableAdminUi: false,
    apiAdminToken: "admin-token-that-must-never-be-used-000000000001",
    logger: { error() {} }
  }));
  const webUrl = await listen(webServer);

  t.after(async () => {
    await close(webServer);
    await close(apiServer);
  });

  for (const path of [
    "/proveedor/activar/",
    "/proveedor/verificar-correo/",
    "/proveedor/configurar-2fa/",
    "/proveedor/codigos-recuperacion/"
  ]) {
    const page = await fetch(`${webUrl}${path}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Atelier Lumière/);
    assert.match(html, /noindex,nofollow,noarchive/);
  }

  const script = await fetch(`${webUrl}/proveedor/onboarding.js`);
  const scriptText = await script.text();
  assert.equal(scriptText.includes("DEV_ADMIN_TOKEN"), false);
  assert.equal(scriptText.includes("Authorization"), false);
  assert.equal(scriptText.includes("localStorage"), false);
  assert.match(scriptText, /sessionStorage/);

  const routes = [
    ["/internal/provider/invitation-preview", { token: "invitation-token-test-00000000000000000000001" }],
    ["/internal/provider/invitation-accept", { token: "invitation-token-test-00000000000000000000001", displayName: "Artesana", password: "Clave-segura-2026!" }],
    ["/internal/provider/email-verify", { token: "email-token-test-000000000000000000000000000001" }],
    ["/internal/provider/email-resend", { token: "email-token-test-000000000000000000000000000001" }],
    ["/internal/provider/two-factor-setup", { token: "two-factor-token-test-000000000000000000000001" }],
    ["/internal/provider/two-factor-confirm", { token: "two-factor-token-test-000000000000000000000001", code: "123456" }]
  ];

  for (const [path, body] of routes) {
    const result = await post(webUrl, path, body);
    assert.equal(result.response.status, 200);
  }

  assert.equal(received.length, 6);
  assert.ok(received.every((entry) => entry.authorization === null));
  assert.deepEqual(received.map((entry) => entry.path), [
    "/api/provider-invitations/preview",
    "/api/provider-invitations/accept",
    "/api/email-verifications/verify",
    "/api/email-verifications/resend",
    "/api/two-factor/setup",
    "/api/two-factor/confirm"
  ]);

  const forbiddenMethod = await fetch(`${webUrl}/internal/provider/invitation-preview`);
  assert.equal(forbiddenMethod.status, 405);

  const unknownRoute = await post(webUrl, "/internal/provider/delete-account", {});
  assert.equal(unknownRoute.response.status, 404);
});
