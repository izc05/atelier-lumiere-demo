import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createPilotCheckoutWebHandler } from "../src/pilot-checkout-proxy.mjs";

async function withServer(fetchImpl, callback, options = {}) {
  const baseHandler = (_request, response) => {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("not found");
  };
  const handler = createPilotCheckoutWebHandler({
    baseHandler,
    apiInternalUrl: "http://api.internal:4000",
    fetchImpl,
    logger: { error() {} },
    ...options
  });
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("el BFF transmite el checkout sin añadir credenciales", async () => {
  const payload = {
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    customer: { name: "Cliente", email: "cliente@example.test" },
    items: [{ productId: "22222222-2222-4222-8222-222222222222", quantity: 1 }]
  };
  let captured;
  await withServer(async (url, options) => {
    captured = {
      url: String(url),
      method: options.method,
      authorization: options.headers.Authorization,
      body: JSON.parse(Buffer.from(options.body).toString("utf8"))
    };
    return new Response(JSON.stringify({ checkoutId: "33333333-3333-4333-8333-333333333333" }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/checkout/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).checkoutId, "33333333-3333-4333-8333-333333333333");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("permissions-policy") ?? "", /payment=\(\)/);
  });
  assert.equal(captured.url, "http://api.internal:4000/api/pilot-checkout/submit");
  assert.equal(captured.method, "POST");
  assert.equal(captured.authorization, undefined);
  assert.deepEqual(captured.body, payload);
});

test("rechaza métodos y limita intentos antes de consultar la API", async () => {
  let calls = 0;
  await withServer(async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  }, async (baseUrl) => {
    const getResponse = await fetch(`${baseUrl}/internal/checkout/submit`);
    assert.equal(getResponse.status, 405);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`${baseUrl}/internal/checkout/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      assert.equal(response.status, 201);
    }
    const limited = await fetch(`${baseUrl}/internal/checkout/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "600");
  });
  assert.equal(calls, 10);
});

test("propaga un error funcional sin revelar detalles internos", async () => {
  await withServer(async () => new Response(JSON.stringify({
    error: "CHECKOUT_STOCK_UNAVAILABLE",
    message: "No hay suficientes unidades."
  }), {
    status: 409,
    headers: { "Content-Type": "application/json" }
  }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/checkout/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: "CHECKOUT_STOCK_UNAVAILABLE",
      message: "No hay suficientes unidades."
    });
  });
});
