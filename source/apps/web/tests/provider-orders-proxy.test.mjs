import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createProviderOrdersWebHandler } from "../src/provider-orders-proxy.mjs";

const TOKEN = "provider_session_token_1234567890abcdef1234567890abcdef";
const ORDER_ID = "51000000-0000-4000-8000-000000000001";

async function readStream(stream) {
  if (!stream) return "";
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function startServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

test("el proxy protege páginas y transmite pedidos sin filtrar el token", async (t) => {
  const calls = [];
  const fetchImpl = async (target, options = {}) => {
    const url = new URL(target);
    const body = await readStream(options.body);
    calls.push({
      path: `${url.pathname}${url.search}`,
      method: options.method ?? "GET",
      authorization: options.headers?.get?.("Authorization") ?? options.headers?.Authorization,
      body
    });

    if (url.pathname === "/api/provider/me") {
      return new Response(JSON.stringify({ user: { id: "user" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.searchParams.get("force") === "401") {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/api/provider/orders" && (options.method ?? "GET") === "GET") {
      return new Response(JSON.stringify({ orders: [{ id: ORDER_ID, orderNumber: "AL-TEST" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === `/api/provider/orders/${ORDER_ID}/transitions`) {
      return new Response(JSON.stringify({ order: { id: ORDER_ID, status: "ACCEPTED" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  };

  const baseHandler = (_request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("PRIVATE_PAGE");
  };
  const handler = createProviderOrdersWebHandler({
    baseHandler,
    apiInternalUrl: "http://api.internal:4000",
    fetchImpl,
    logger: { error() {} }
  });
  const server = await startServer(handler);
  t.after(server.close);

  const anonymousPage = await fetch(`${server.baseUrl}/proveedor/pedidos/`, { redirect: "manual" });
  assert.equal(anonymousPage.status, 302);
  assert.equal(anonymousPage.headers.get("location"), "/proveedor/acceso/");
  assert.match(anonymousPage.headers.get("set-cookie"), /HttpOnly/);

  const privatePage = await fetch(`${server.baseUrl}/proveedor/pedidos/`, {
    headers: { Cookie: `atelier_provider_session=${TOKEN}` }
  });
  assert.equal(privatePage.status, 200);
  assert.equal(await privatePage.text(), "PRIVATE_PAGE");
  assert.equal(calls.at(-1).path, "/api/provider/me");
  assert.equal(calls.at(-1).authorization, `Bearer ${TOKEN}`);

  const listResponse = await fetch(`${server.baseUrl}/internal/provider/orders`, {
    headers: { Cookie: `atelier_provider_session=${TOKEN}` }
  });
  assert.equal(listResponse.status, 200);
  const listPayload = await listResponse.json();
  assert.equal(listPayload.orders[0].id, ORDER_ID);
  assert.equal(JSON.stringify(listPayload).includes(TOKEN), false);

  const transitionBody = JSON.stringify({
    status: "ACCEPTED",
    expectedVersion: 1,
    note: "Pedido revisado."
  });
  const transitionResponse = await fetch(
    `${server.baseUrl}/internal/provider/orders/${ORDER_ID}/transitions`,
    {
      method: "POST",
      headers: {
        Cookie: `atelier_provider_session=${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: transitionBody
    }
  );
  assert.equal(transitionResponse.status, 200);
  assert.equal(calls.at(-1).body, transitionBody);
  assert.equal(calls.at(-1).authorization, `Bearer ${TOKEN}`);

  const disallowed = await fetch(`${server.baseUrl}/internal/provider/orders/${ORDER_ID}`, {
    method: "DELETE",
    headers: { Cookie: `atelier_provider_session=${TOKEN}` }
  });
  assert.equal(disallowed.status, 405);

  const unauthorized = await fetch(`${server.baseUrl}/internal/provider/orders?force=401`, {
    headers: { Cookie: `atelier_provider_session=${TOKEN}` }
  });
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("set-cookie"), /Max-Age=0/);
  assert.match(unauthorized.headers.get("set-cookie"), /HttpOnly/);
});
