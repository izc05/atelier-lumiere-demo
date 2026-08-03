import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { createPaymentSandboxApiHandler } from "../src/payment-sandbox-api.mjs";

const SECRET = "payment-webhook-secret-with-more-than-thirty-two-characters";

async function start(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function signature(body) {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

test("el webhook sandbox exige firma HMAC y conserva la respuesta idempotente", async (t) => {
  const calls = [];
  const service = {
    enabled: true,
    async processWebhook(value) {
      calls.push(value);
      return { processed: true, paymentStatus: "CAPTURED" };
    },
    async begin(token) {
      return { tokenSeen: token, status: "CREATED" };
    },
    async simulate(token, outcome) {
      return { tokenSeen: token, outcome, status: "CAPTURED" };
    }
  };
  const app = await start(createPaymentSandboxApiHandler({
    paymentSandboxService: service,
    webhookSecret: SECRET,
    logger: { error() {} },
    baseHandler(_request, response) {
      response.writeHead(404);
      response.end();
    }
  }));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const event = {
    eventId: "evt-sandbox-001",
    eventType: "payment.captured",
    providerReference: "AL-SANDBOX-1234567890ABCDEF",
    amountCents: 5500,
    currency: "EUR"
  };
  const body = JSON.stringify(event);

  const unsigned = await fetch(`${app.baseUrl}/api/payment-sandbox/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });
  assert.equal(unsigned.status, 401);
  assert.equal(calls.length, 0);

  const invalid = await fetch(`${app.baseUrl}/api/payment-sandbox/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Atelier-Payment-Signature": "0".repeat(64)
    },
    body
  });
  assert.equal(invalid.status, 401);
  assert.equal(calls.length, 0);

  const accepted = await fetch(`${app.baseUrl}/api/payment-sandbox/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Atelier-Payment-Signature": signature(body)
    },
    body
  });
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).paymentStatus, "CAPTURED");
  assert.deepEqual(calls, [event]);

  const begin = await fetch(`${app.baseUrl}/api/payment-sandbox/begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "sandbox-token-with-more-than-thirty-two-characters" })
  });
  assert.equal(begin.status, 200);
  assert.equal((await begin.json()).status, "CREATED");

  const simulated = await fetch(`${app.baseUrl}/api/payment-sandbox/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: "sandbox-token-with-more-than-thirty-two-characters",
      outcome: "success"
    })
  });
  assert.equal(simulated.status, 200);
  assert.equal((await simulated.json()).status, "CAPTURED");
});

test("el endpoint desaparece cuando el sandbox está desactivado", async (t) => {
  const app = await start(createPaymentSandboxApiHandler({
    paymentSandboxService: null,
    webhookSecret: SECRET,
    logger: { error() {} },
    baseHandler(_request, response) {
      response.writeHead(404);
      response.end();
    }
  }));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const response = await fetch(`${app.baseUrl}/api/payment-sandbox/begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "sandbox-token-with-more-than-thirty-two-characters" })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "PAYMENT_SANDBOX_DISABLED");
});
