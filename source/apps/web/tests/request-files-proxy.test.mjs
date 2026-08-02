import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRequestFilesWebHandler } from "../src/request-files-proxy.mjs";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const FILE_ID = "22222222-2222-4222-8222-222222222222";
const PROVIDER_TOKEN = "provider_private_session_token_1234567890";
const CUSTOMER_TOKEN = "customer_private_session_token_1234567890";

async function readBody(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function withServer(fetchImpl, callback) {
  const baseHandler = (_request, response) => {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("not found");
  };
  const handler = createRequestFilesWebHandler({
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

test("el proveedor sube un archivo por streaming sin exponer su token", async () => {
  const source = Buffer.from("private-image-binary");
  let captured;
  await withServer(async (url, options) => {
    captured = {
      url: String(url),
      method: options.method,
      authorization: options.headers.get("authorization"),
      filename: options.headers.get("x-file-name"),
      mimeType: options.headers.get("content-type"),
      body: await readBody(options.body)
    };
    return new Response(JSON.stringify({ file: { id: FILE_ID } }), {
      status: 201,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/provider/custom-requests/${REQUEST_ID}/files`, {
      method: "POST",
      headers: {
        Cookie: `atelier_provider_session=${PROVIDER_TOKEN}`,
        "Content-Type": "image/png",
        "X-File-Name": encodeURIComponent("referencia privada.png")
      },
      body: source
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { file: { id: FILE_ID } });
  });
  assert.equal(captured.url, `http://api.internal:4000/api/provider/custom-requests/${REQUEST_ID}/files`);
  assert.equal(captured.method, "POST");
  assert.equal(captured.authorization, `Bearer ${PROVIDER_TOKEN}`);
  assert.equal(captured.mimeType, "image/png");
  assert.equal(captured.filename, encodeURIComponent("referencia privada.png"));
  assert.deepEqual(captured.body, source);
});

test("el cliente descarga por rangos conservando cabeceras privadas", async () => {
  const source = Buffer.from("%PDF-1.4");
  let captured;
  await withServer(async (url, options) => {
    captured = {
      url: String(url),
      authorization: options.headers.get("authorization"),
      range: options.headers.get("range")
    };
    return new Response(source, {
      status: 206,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(source.length),
        "Content-Disposition": "attachment; filename=propuesta.pdf",
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes 0-${source.length - 1}/80`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox"
      }
    });
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/customer/request-files/${FILE_ID}/content`, {
      headers: {
        Cookie: `atelier_customer_session=${CUSTOMER_TOKEN}`,
        Range: `bytes=0-${source.length - 1}`
      }
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-disposition"), "attachment; filename=propuesta.pdf");
    assert.equal(response.headers.get("content-range"), `bytes 0-${source.length - 1}/80`);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), source);
  });
  assert.equal(captured.url, `http://api.internal:4000/api/customer/request-files/${FILE_ID}/content`);
  assert.equal(captured.authorization, `Bearer ${CUSTOMER_TOKEN}`);
  assert.equal(captured.range, `bytes=0-${source.length - 1}`);
});

test("sin cookie no se consulta la API y una ruta no permitida devuelve 405", async () => {
  let calls = 0;
  await withServer(async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  }, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/internal/customer/request-files/${FILE_ID}/content`);
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.headers.get("set-cookie") ?? "", /atelier_customer_session=/);

    const wrongMethod = await fetch(`${baseUrl}/internal/provider/request-files/${FILE_ID}/content`, {
      method: "DELETE",
      headers: { Cookie: `atelier_provider_session=${PROVIDER_TOKEN}` }
    });
    assert.equal(wrongMethod.status, 405);
  });
  assert.equal(calls, 0);
});

test("la retirada utiliza la sesión del actor y propaga un 401 borrando la cookie", async () => {
  await withServer(async (_url, options) => {
    assert.equal(options.method, "DELETE");
    assert.equal(options.headers.get("authorization"), `Bearer ${CUSTOMER_TOKEN}`);
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/internal/customer/request-files/${FILE_ID}`, {
      method: "DELETE",
      headers: { Cookie: `atelier_customer_session=${CUSTOMER_TOKEN}` }
    });
    assert.equal(response.status, 401);
    assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  });
});
