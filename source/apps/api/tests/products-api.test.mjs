import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { createDatabase } from "../src/database.mjs";
import { createProductsApiHandler } from "../src/products-api.mjs";
import { createProductsService } from "../src/products-service.mjs";

const connectionString = process.env.DATABASE_URL;

async function requestJson(baseUrl, path, {
  method = "GET",
  body,
  bearer
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json();
  return { response, payload };
}

test("la API de artículos respeta sesión, taller, versión y revisión", {
  skip: !connectionString
}, async (t) => {
  const database = createDatabase({
    connectionString,
    maxConnections: 5,
    statementTimeoutMs: 5000,
    logger: { error() {} }
  });
  const productsService = createProductsService({ database });
  const tokenA = "provider-product-session-a-00000000000000000001";
  const tokenB = "provider-product-session-b-00000000000000000002";
  const contextA = {
    userId: "00000000-0000-4000-8000-000000000101",
    providerId: "00000000-0000-4000-8000-000000000201",
    role: "PROVIDER_OWNER"
  };
  const contextB = {
    userId: "00000000-0000-4000-8000-000000000102",
    providerId: "00000000-0000-4000-8000-000000000202",
    role: "PROVIDER_OWNER"
  };
  const providerAuthService = {
    async authenticate(token) {
      if (token === tokenA) return { context: contextA };
      if (token === tokenB) return { context: contextB };
      return null;
    }
  };
  const baseHandler = (_request, response) => {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  };
  const handler = createProductsApiHandler({
    baseHandler,
    productsService,
    providerAuthService,
    logger: { error() {} }
  });
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await database.close();
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const unauthorized = await requestJson(baseUrl, "/api/provider/products");
  assert.equal(unauthorized.response.status, 401);
  assert.equal(unauthorized.payload.error, "UNAUTHORIZED");

  const suffix = randomUUID().slice(0, 8);
  const created = await requestJson(baseUrl, "/api/provider/products", {
    method: "POST",
    bearer: tokenA,
    body: {
      name: `Álbum bordado ${suffix}`,
      shortDescription: "Álbum artesanal bordado a mano para conservar recuerdos de una celebración especial.",
      story: "Se prepara de forma individual en el taller y admite nombres y fechas.",
      category: "Papelería artesanal",
      priceCents: 6500,
      stockMode: "MADE_TO_ORDER",
      preparationMinDays: 5,
      preparationMaxDays: 10,
      customizable: true,
      personalizationNotes: "Nombre, fecha y color principal.",
      shippingNotes: "Protección rígida y seguimiento del envío."
    }
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.product.status, "DRAFT");
  assert.equal(created.payload.product.version, 1);
  assert.equal(created.payload.product.providerId, contextA.providerId);
  const productId = created.payload.product.id;

  const foreignRead = await requestJson(baseUrl, `/api/provider/products/${productId}`, {
    bearer: tokenB
  });
  assert.equal(foreignRead.response.status, 404);
  assert.equal(foreignRead.payload.error, "PRODUCT_NOT_FOUND");

  const events = await requestJson(baseUrl, `/api/provider/products/${productId}/events`, {
    method: "PUT",
    bearer: tokenA,
    body: { events: ["boda", "aniversario", "boda"] }
  });
  assert.equal(events.response.status, 200);
  assert.deepEqual(events.payload.events, ["boda", "aniversario"]);

  const personalizations = await requestJson(
    baseUrl,
    `/api/provider/products/${productId}/personalizations`,
    {
      method: "PUT",
      bearer: tokenA,
      body: {
        personalizations: [
          {
            name: "Nombre bordado",
            optionType: "TEXT",
            required: true,
            priceDeltaCents: 0
          },
          {
            name: "Color principal",
            optionType: "COLOR",
            required: true,
            choices: ["burdeos", "verde", "azul"],
            priceDeltaCents: 200
          }
        ]
      }
    }
  );
  assert.equal(personalizations.response.status, 200);
  assert.equal(personalizations.payload.personalizations.length, 2);

  const updated = await requestJson(baseUrl, `/api/provider/products/${productId}`, {
    method: "PATCH",
    bearer: tokenA,
    body: {
      expectedVersion: 1,
      priceCents: 6900,
      preparationMaxDays: 12
    }
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.payload.product.priceCents, 6900);
  assert.equal(updated.payload.product.version, 2);

  const staleUpdate = await requestJson(baseUrl, `/api/provider/products/${productId}`, {
    method: "PATCH",
    bearer: tokenA,
    body: {
      expectedVersion: 1,
      priceCents: 7100
    }
  });
  assert.equal(staleUpdate.response.status, 409);
  assert.equal(staleUpdate.payload.error, "PRODUCT_VERSION_CONFLICT");
  assert.equal(staleUpdate.payload.details.currentVersion, 2);

  await database.withContext(contextA, async (transaction) => {
    await transaction.query(
      `INSERT INTO product_media (
         provider_id, product_id, kind, mime_type, original_filename,
         storage_key, size_bytes, checksum_sha256, status,
         alt_text, width, height, uploaded_by
       ) VALUES ($1, $2, 'IMAGE', 'image/webp', $3, $4, $5, $6, 'READY', $7, 1400, 1400, $8)`,
      [
        contextA.providerId,
        productId,
        `album-${suffix}.webp`,
        `providers/${contextA.providerId}/products/${productId}/cover.webp`,
        4096,
        createHash("sha256").update(`image-${suffix}`).digest("hex"),
        "Portada del álbum bordado",
        contextA.userId
      ]
    );
  });

  const submitted = await requestJson(baseUrl, `/api/provider/products/${productId}/submit`, {
    method: "POST",
    bearer: tokenA,
    body: {
      expectedVersion: 2,
      providerNote: "Ficha completa y fotografía principal preparada."
    }
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.payload.product.status, "IN_REVIEW");
  assert.equal(submitted.payload.product.version, 3);
  assert.equal(submitted.payload.review.status, "PENDING");
  assert.equal(submitted.payload.review.submissionNumber, 1);

  const lockedUpdate = await requestJson(baseUrl, `/api/provider/products/${productId}`, {
    method: "PATCH",
    bearer: tokenA,
    body: {
      expectedVersion: 3,
      priceCents: 7200
    }
  });
  assert.equal(lockedUpdate.response.status, 409);
  assert.equal(lockedUpdate.payload.error, "PRODUCT_LOCKED");

  const detail = await requestJson(baseUrl, `/api/provider/products/${productId}`, {
    bearer: tokenA
  });
  assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.payload.product.events, ["aniversario", "boda"]);
  assert.equal(detail.payload.product.personalizations.length, 2);
  assert.equal(detail.payload.product.media.length, 1);
  assert.equal(detail.payload.product.media[0].status, "READY");
  assert.equal(detail.payload.product.reviews[0].status, "PENDING");
  assert.equal(JSON.stringify(detail.payload).includes("storage_key"), false);

  const listA = await requestJson(baseUrl, "/api/provider/products", { bearer: tokenA });
  assert.equal(listA.response.status, 200);
  assert.ok(listA.payload.products.some((product) => product.id === productId));

  const listB = await requestJson(baseUrl, "/api/provider/products", { bearer: tokenB });
  assert.equal(listB.response.status, 200);
  assert.equal(listB.payload.products.some((product) => product.id === productId), false);

  const audits = await database.withContext({
    userId: "00000000-0000-4000-8000-000000000001",
    providerId: null,
    role: "ADMIN"
  }, async (transaction) => {
    const result = await transaction.query(
      `SELECT action FROM audit_events
       WHERE provider_id = $1 AND entity_id = $2
       ORDER BY created_at`,
      [contextA.providerId, productId]
    );
    return result.rows.map((row) => row.action);
  });
  assert.ok(audits.includes("PRODUCT_CREATED"));
  assert.ok(audits.includes("PRODUCT_UPDATED"));
  assert.ok(audits.includes("PRODUCT_SUBMITTED_FOR_REVIEW"));
});
