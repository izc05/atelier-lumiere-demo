import test from "node:test";
import assert from "node:assert/strict";
import { createApiHandler } from "../src/app.mjs";

function responseCapture() {
  return {
    statusCode: null,
    body: "",
    writeHead(statusCode) { this.statusCode = statusCode; },
    end(chunk = "") { this.body += chunk; }
  };
}

function request(method, url, payload) {
  const body = payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))];
  return {
    method,
    url,
    headers: payload === undefined ? {} : { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() { yield* body; }
  };
}

test("la API crea una solicitud pública y solo devuelve su referencia", async () => {
  const handler = createApiHandler({
    workshopApplicationsService: {
      async submit(input) {
        assert.equal(input.displayName, "Taller de prueba");
        return {
          id: "00000000-0000-4000-8000-000000000601",
          status: "PENDING",
          contactEmail: "privado@example.com",
          createdAt: "2026-08-08T12:00:00.000Z"
        };
      }
    }
  });
  const response = responseCapture();
  await handler(request("POST", "/api/workshop-applications", { displayName: "Taller de prueba" }), response);
  assert.equal(response.statusCode, 201);
  const payload = JSON.parse(response.body);
  assert.equal(payload.application.status, "PENDING");
  assert.equal(JSON.stringify(payload).includes("privado@example.com"), false);
});

test("la lista administrativa requiere autenticación", async () => {
  const handler = createApiHandler({
    providersService: {},
    workshopApplicationsService: { async list() { return []; } },
    authenticateRequest: async () => null
  });
  const response = responseCapture();
  await handler(request("GET", "/api/admin/workshop-applications"), response);
  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).error, "UNAUTHORIZED");
});
