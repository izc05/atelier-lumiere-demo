import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createOrderLogisticsWebHandler } from "../src/order-logistics-proxy.mjs";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_ID = "22222222-2222-4222-8222-222222222222";
const PROVIDER_TOKEN = "provider_logistics_session_token_123456789";
const CUSTOMER_TOKEN = "customer_logistics_session_token_123456789";

async function withServer(fetchImpl, callback) {
  const baseHandler = (_request, response) => {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("not found");
  };
  const handler = createOrderLogisticsWebHandler({
    baseHandler,
    apiInternalUrl: "http://api.internal:4000",
    fetchImpl,
    logger: { error() {} }
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

test("el taller crea seguimiento usando solo su cookie HttpOnly", async () => {
  let captured;
  await withServer(async (url, options) => {
    captured = {
      url: String(url),
      method: options.method,
      authorization: options.headers.Authorization,
      body: JSON.parse(Buffer.from(options.body).toString("utf8"))
    };
    return new Response(JSON.stringify({ shipment: { id: RESOURCE_ID } }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/provider/orders/${ORDER_ID}/shipments`, {
      method: "POST",
      headers: {
        Cookie: `atelier_provider_session=${PROVIDER_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status: "LABEL_CREATED", carrier: "Correos", trackingCode: "ABC123" })
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { shipment: { id: RESOURCE_ID } });
  });
  assert.equal(captured.url, `http://api.internal:4000/api/provider/orders/${ORDER_ID}/shipments`);
  assert.equal(captured.method, "POST");
  assert.equal(captured.authorization, `Bearer ${PROVIDER_TOKEN}`);
  assert.equal(captured.body.status, "LABEL_CREATED");
});

test("el cliente puede abrir una incidencia pero no actualizarla", async () => {
  let calls = 0;
  await withServer(async (url, options) => {
    calls += 1;
    assert.equal(String(url), `http://api.internal:4000/api/customer/orders/${ORDER_ID}/incidents`);
    assert.equal(options.headers.Authorization, `Bearer ${CUSTOMER_TOKEN}`);
    return new Response(JSON.stringify({ incident: { id: RESOURCE_ID, status: "OPEN" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  }, async (baseUrl) => {
    const created = await fetch(`${baseUrl}/internal/customer/orders/${ORDER_ID}/incidents`, {
      method: "POST",
      headers: { Cookie: `atelier_customer_session=${CUSTOMER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "DELAY", description: "El pedido acumula un retraso que necesito revisar." })
    });
    assert.equal(created.status, 201);

    const forbiddenMethod = await fetch(`${baseUrl}/internal/customer/orders/${ORDER_ID}/incidents/${RESOURCE_ID}`, {
      method: "PATCH",
      headers: { Cookie: `atelier_customer_session=${CUSTOMER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "RESOLVED" })
    });
    assert.equal(forbiddenMethod.status, 405);
  });
  assert.equal(calls, 1);
});

test("el taller actualiza una incidencia con control de fecha", async () => {
  let captured;
  await withServer(async (url, options) => {
    captured = {
      url: String(url),
      method: options.method,
      body: JSON.parse(Buffer.from(options.body).toString("utf8"))
    };
    return new Response(JSON.stringify({ incident: { id: RESOURCE_ID, status: "RESOLVED" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/provider/orders/${ORDER_ID}/incidents/${RESOURCE_ID}`, {
      method: "PATCH",
      headers: { Cookie: `atelier_provider_session=${PROVIDER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "RESOLVED",
        resolution: "El transportista ha corregido la entrega.",
        expectedUpdatedAt: "2026-08-02T20:00:00.000Z"
      })
    });
    assert.equal(response.status, 200);
  });
  assert.equal(captured.url, `http://api.internal:4000/api/provider/orders/${ORDER_ID}/incidents/${RESOURCE_ID}`);
  assert.equal(captured.method, "PATCH");
  assert.equal(captured.body.expectedUpdatedAt, "2026-08-02T20:00:00.000Z");
});

test("sin cookie no se consulta la API y un 401 revoca la cookie", async () => {
  let calls = 0;
  await withServer(async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/internal/provider/orders/${ORDER_ID}/shipments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get("set-cookie") ?? "", /Max-Age=0/);

    const expired = await fetch(`${baseUrl}/internal/provider/orders/${ORDER_ID}/shipments`, {
      method: "POST",
      headers: { Cookie: `atelier_provider_session=${PROVIDER_TOKEN}`, "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(expired.status, 401);
    assert.match(expired.headers.get("set-cookie") ?? "", /atelier_provider_session=/);
  });
  assert.equal(calls, 1);
});
