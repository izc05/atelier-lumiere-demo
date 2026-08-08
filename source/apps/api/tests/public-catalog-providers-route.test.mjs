import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createPublicCatalogApiHandler } from "../src/public-catalog-api.mjs";

async function startServer(service) {
  const handler = createPublicCatalogApiHandler({
    baseHandler(_request, response) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "NOT_FOUND" }));
    },
    publicCatalogService: service,
    logger: { error() {} }
  });
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

test("GET /api/catalog/providers devuelve solo el directorio serializado por el servicio", async (t) => {
  const calls = [];
  const providers = [{
    slug: "taller-luz",
    displayName: "Taller Luz",
    specialty: "Bordado",
    publishedProductCount: 0
  }];
  const service = {
    async listProviders(input) {
      calls.push(input);
      return providers;
    }
  };
  const server = await startServer(service);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${baseUrl}/api/catalog/providers?q=luz&specialty=bordado&custom=true`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, { providers });
  assert.deepEqual(calls, [{ query: "luz", specialty: "bordado", customOnly: true }]);
  assert.match(response.headers.get("cache-control") || "", /stale-while-revalidate=300/);
});

test("el directorio público de talleres es de solo lectura", async (t) => {
  const service = { async listProviders() { return []; } };
  const server = await startServer(service);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${baseUrl}/api/catalog/providers`, { method: "POST" });
  const payload = await response.json();

  assert.equal(response.status, 405);
  assert.equal(payload.error, "METHOD_NOT_ALLOWED");
});
