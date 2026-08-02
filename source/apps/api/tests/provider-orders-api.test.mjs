import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createProviderOrdersApiHandler } from "../src/provider-orders-api.mjs";

const TOKEN = "provider_api_session_1234567890abcdef1234567890abcdef";
const REQUEST_ID = "53000000-0000-4000-8000-000000000001";
const CONTEXT = {
  role: "PROVIDER_OWNER",
  userId: "00000000-0000-4000-8000-000000000101",
  providerId: "00000000-0000-4000-8000-000000000201"
};

async function start(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

test("el taller no puede aprobar su propio presupuesto desde la API", async (t) => {
  const calls = [];
  const providerOrdersService = {
    async transitionCustomRequest(context, requestId, input) {
      calls.push({ context, requestId, input });
      return { id: requestId, status: input.status, version: 2 };
    }
  };
  const providerAuthService = {
    async authenticate(token) {
      return token === TOKEN ? { context: CONTEXT } : null;
    }
  };
  const handler = createProviderOrdersApiHandler({
    baseHandler: (_request, response) => {
      response.writeHead(404);
      response.end();
    },
    providerOrdersService,
    providerAuthService,
    logger: { error() {} }
  });
  const server = await start(handler);
  t.after(server.close);

  const blocked = await fetch(
    `${server.baseUrl}/api/provider/custom-requests/${REQUEST_ID}/transitions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status: "APPROVED", expectedVersion: 1 })
    }
  );
  assert.equal(blocked.status, 403);
  const blockedPayload = await blocked.json();
  assert.equal(blockedPayload.error, "CUSTOM_REQUEST_APPROVAL_CUSTOMER_ONLY");
  assert.equal(calls.length, 0);

  const quoted = await fetch(
    `${server.baseUrl}/api/provider/custom-requests/${REQUEST_ID}/transitions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "QUOTED",
        expectedVersion: 1,
        quotedPriceCents: 4850,
        note: "Presupuesto preparado."
      })
    }
  );
  assert.equal(quoted.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestId, REQUEST_ID);
  assert.equal(calls[0].input.status, "QUOTED");
  assert.equal(calls[0].input.quotedPriceCents, 4850);
});
