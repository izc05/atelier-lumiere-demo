import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createDatabase } from "../src/database.mjs";
import { createCustomRequestFilesService } from "../src/custom-request-files-service.mjs";
import { createRequestFileStorage } from "../src/request-file-storage.mjs";

const connectionString = process.env.DATABASE_URL;
const ADMIN = { role: "ADMIN", userId: "00000000-0000-4000-8000-000000000001", providerId: null };
const PROVIDER_A = "00000000-0000-4000-8000-000000000201";
const PROVIDER_B = "00000000-0000-4000-8000-000000000202";
const OWNER_A = "00000000-0000-4000-8000-000000000101";
const OWNER_B = "00000000-0000-4000-8000-000000000102";

async function streamBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function address() {
  return { line1: "Calle privada 6", city: "Granada", postalCode: "18001", country: "ES" };
}

test("cliente y taller comparten archivos privados sin cruces entre proveedores", { skip: !connectionString }, async (t) => {
  const database = createDatabase({ connectionString, maxConnections: 5, statementTimeoutMs: 5000, logger: { error() {} } });
  const rootPath = await mkdtemp(join(tmpdir(), "atelier-request-files-"));
  t.after(async () => { await database.close(); await rm(rootPath, { recursive: true, force: true }); });

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const customerId = randomUUID();
  const checkoutId = randomUUID();
  const orderId = randomUUID();
  const itemId = randomUUID();
  const requestId = randomUUID();
  const customer = { role: "CUSTOMER", userId: customerId, providerId: null };
  const providerA = { role: "PROVIDER_OWNER", userId: OWNER_A, providerId: PROVIDER_A };
  const providerB = { role: "PROVIDER_OWNER", userId: OWNER_B, providerId: PROVIDER_B };
  const email = `files-${suffix.toLowerCase()}@example.test`;

  await database.withContext(ADMIN, async (tx) => {
    await tx.query("INSERT INTO users(id,email,display_name,status,email_verified_at,two_factor_enabled) VALUES($1,$2,'Cliente archivos','ACTIVE',now(),false)", [customerId, email]);
    await tx.query(
      `INSERT INTO checkout_batches(id,customer_user_id,checkout_reference,currency,customer_name,contact_email,shipping_address,status,submitted_at)
       VALUES($1,$2,$3,'EUR','Cliente archivos',$4,$5::jsonb,'SUBMITTED',now())`,
      [checkoutId, customerId, `AL-CHECKOUT-FILES-${suffix}`, email, JSON.stringify(address())]
    );
    await tx.query(
      `INSERT INTO provider_orders(id,checkout_id,provider_id,customer_user_id,order_number,status,currency,subtotal_cents,shipping_cents,total_cents,customer_name,contact_email,shipping_address)
       VALUES($1,$2,$3,$4,$5,'PENDING_CONFIRMATION','EUR',3500,500,4000,'Cliente archivos',$6,$7::jsonb)`,
      [orderId, checkoutId, PROVIDER_A, customerId, `AL-FILES-${suffix}`, email, JSON.stringify(address())]
    );
    await tx.query(
      `INSERT INTO order_items(id,order_id,provider_id,customer_user_id,item_type,product_name,quantity,unit_price_cents,line_total_cents,currency,personalization)
       VALUES($1,$2,$3,$4,'CUSTOM','Diseño personalizado',1,3500,3500,'EUR','{}'::jsonb)`,
      [itemId, orderId, PROVIDER_A, customerId]
    );
    await tx.query(
      `INSERT INTO custom_requests(id,order_id,order_item_id,provider_id,customer_user_id,title,brief,status,currency)
       VALUES($1,$2,$3,$4,$5,'Diseño con referencia','Necesito compartir referencias privadas entre cliente y taller para completar el encargo.','OPEN','EUR')`,
      [requestId, orderId, itemId, PROVIDER_A, customerId]
    );
  });

  const storage = createRequestFileStorage({ rootPath });
  const service = createCustomRequestFilesService({ database, storage });
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.from("private-reference")]);
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n", "ascii");

  const customerFile = await service.upload(customer, requestId, {
    originalFilename: "referencia-cliente.png",
    mimeType: "image/png",
    expectedBytes: png.length,
    stream: Readable.from(png)
  });
  assert.equal(customerFile.mimeType, "image/png");
  assert.equal(customerFile.uploadedBy, customerId);
  assert.match(customerFile.contentPath, /^\/api\/request-files\//);

  const openedByProvider = await service.open(providerA, customerFile.id);
  assert.deepEqual(await streamBuffer(openedByProvider.stream), png);
  await assert.rejects(() => service.open(providerB, customerFile.id), (error) => error?.code === "REQUEST_FILE_NOT_FOUND");
  await assert.rejects(() => service.remove(providerA, customerFile.id), (error) => error?.code === "REQUEST_FILE_NOT_FOUND");

  const providerFile = await service.upload(providerA, requestId, {
    originalFilename: "propuesta-taller.pdf",
    mimeType: "application/pdf",
    expectedBytes: pdf.length,
    stream: Readable.from(pdf)
  });
  assert.equal(providerFile.uploadedBy, OWNER_A);
  const openedByCustomer = await service.open(customer, providerFile.id, "bytes=0-7");
  assert.equal(openedByCustomer.statusCode, 206);
  assert.deepEqual(await streamBuffer(openedByCustomer.stream), pdf.subarray(0, 8));

  await assert.rejects(
    () => service.upload(customer, requestId, {
      originalFilename: "falso.pdf",
      mimeType: "application/pdf",
      expectedBytes: png.length,
      stream: Readable.from(png)
    }),
    (error) => error?.code === "REQUEST_FILE_CONTENT_INVALID"
  );

  assert.deepEqual(await service.remove(customer, customerFile.id), { deleted: true, id: customerFile.id });
  await assert.rejects(() => service.open(providerA, customerFile.id), (error) => error?.code === "REQUEST_FILE_NOT_FOUND");

  await database.withContext(ADMIN, async (tx) => {
    const rows = await tx.query("SELECT status, storage_key, checksum_sha256 FROM custom_request_files WHERE request_id=$1 ORDER BY created_at", [requestId]);
    assert.equal(rows.rowCount, 2);
    assert.equal(rows.rows[0].status, "DELETED");
    assert.equal(rows.rows[1].status, "READY");
    assert.match(rows.rows[1].storage_key, new RegExp(`^providers/${PROVIDER_A}/requests/${requestId}/`));
    assert.match(rows.rows[1].checksum_sha256, /^[a-f0-9]{64}$/);
  });
});
