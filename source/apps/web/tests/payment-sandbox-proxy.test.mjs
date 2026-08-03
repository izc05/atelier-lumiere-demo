import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createPaymentSandboxWebHandler } from "../src/payment-sandbox-proxy.mjs";

async function start(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test("el proxy sandbox no añade credenciales ni expone el webhook", async (t) => {
  const upstream = [];
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    const headers = Object.fromEntries(new Headers(options.headers).entries());
    upstream.push({ path: target.pathname, headers, body: String(options.body) });
    if (target.pathname === "/api/payment-sandbox/begin") {
      return Response.json({ status: "CREATED", amountCents: 5500, currency: "EUR" });
    }
    if (target.pathname === "/api/payment-sandbox/simulate") {
      return Response.json({ status: "CAPTURED", paymentCollected: false });
    }
    throw new Error(`Ruta inesperada: ${target.pathname}`);
  };

  const app = await start(createPaymentSandboxWebHandler({
    enabled: true,
    apiInternalUrl: "http://api:4000",
    fetchImpl,
    logger: { error() {} },
    baseHandler(_request, response) {
      response.writeHead(404);
      response.end();
    }
  }));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const begin = await fetch(`${app.baseUrl}/internal/payment-sandbox/begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "sandbox-token-with-more-than-thirty-two-characters" })
  });
  assert.equal(begin.status, 200);
  assert.equal((await begin.json()).status, "CREATED");

  const simulate = await fetch(`${app.baseUrl}/internal/payment-sandbox/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: "sandbox-token-with-more-than-thirty-two-characters",
      outcome: "success"
    })
  });
  assert.equal(simulate.status, 200);
  assert.equal((await simulate.json()).paymentCollected, false);

  assert.deepEqual(upstream.map((item) => item.path), [
    "/api/payment-sandbox/begin",
    "/api/payment-sandbox/simulate"
  ]);
  for (const item of upstream) {
    assert.equal(item.headers.authorization, undefined);
    assert.equal(item.headers.cookie, undefined);
    assert.equal(item.headers["x-atelier-payment-signature"], undefined);
  }
  assert.equal(JSON.stringify(upstream).includes("/api/payment-sandbox/webhook"), false);

  const beforeCrossSite = upstream.length;
  const crossSite = await fetch(`${app.baseUrl}/internal/payment-sandbox/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "cross-site"
    },
    body: JSON.stringify({ token: "sandbox-token-with-more-than-thirty-two-characters", outcome: "success" })
  });
  assert.equal(crossSite.status, 403);
  assert.equal(upstream.length, beforeCrossSite);
});

test("el proxy sandbox devuelve 404 cuando está apagado", async () => {
  const app = await start(createPaymentSandboxWebHandler({
    enabled: false,
    baseHandler(_request, response) {
      response.writeHead(404);
      response.end();
    },
    fetchImpl: async () => {
      throw new Error("No debe llamar a la API.");
    }
  }));
  try {
    const response = await fetch(`${app.baseUrl}/internal/payment-sandbox/begin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "sandbox-token-with-more-than-thirty-two-characters" })
    });
    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
