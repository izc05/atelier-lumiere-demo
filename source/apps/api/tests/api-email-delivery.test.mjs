import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApiHandler } from "../src/app.mjs";

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

function handlerFor(environment, emailStatus) {
  return createApiHandler({
    environment,
    database: { enabled: true, async ping() { return true; } },
    mailService: { enabled: emailStatus !== "DISABLED" },
    onboardingService: {
      async preview() {
        return { available: true };
      },
      async accept() {
        return {
          provider: { id: "provider-1", displayName: "Taller" },
          user: { id: "user-1", email: "ana@example.test", displayName: "Ana" },
          membership: { id: "membership-1", role: "PROVIDER_OWNER" },
          emailVerification: { id: "verification-1" },
          verificationToken: "verification-secret-token-000000000000000001",
          emailDelivery: { status: emailStatus },
          accessGranted: false
        };
      }
    },
    logger: { error() {} }
  });
}

test("producción nunca devuelve el token aunque SMTP falle", async (t) => {
  const server = createServer(handlerFor("production", "FAILED"));
  const baseUrl = await listen(server);
  t.after(() => close(server));

  const result = await post(baseUrl, "/api/provider-invitations/accept", {
    token: "invitation-token-000000000000000000000000000001",
    displayName: "Ana",
    password: "Clave-segura-2026!"
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.payload.emailDelivery, "failed");
  assert.equal("verificationToken" in result.payload, false);
  assert.equal("verificationPath" in result.payload, false);
  assert.equal(JSON.stringify(result.payload).includes("verification-secret-token"), false);
});

test("desarrollo conserva el enlace manual cuando SMTP está desactivado", async (t) => {
  const server = createServer(handlerFor("development", "DISABLED"));
  const baseUrl = await listen(server);
  t.after(() => close(server));

  const result = await post(baseUrl, "/api/provider-invitations/accept", {
    token: "invitation-token-000000000000000000000000000001",
    displayName: "Ana",
    password: "Clave-segura-2026!"
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.payload.emailDelivery, "manual-development");
  assert.match(result.payload.verificationPath, /^\/proveedor\/verificar-correo\?token=/);
  assert.match(result.payload.verificationToken, /^verification-secret-token/);
});
