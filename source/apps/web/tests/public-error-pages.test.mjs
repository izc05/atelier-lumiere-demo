import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createPublicErrorPagesWebHandler } from "../src/public-error-pages-handler.mjs";

async function startServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`
  };
}

function baseHandler(request, response) {
  if (request.url === "/correcta/") {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "X-Test-Header": "preserved"
    });
    response.end("<!doctype html><title>Correcta</title><h1>Página correcta</h1>");
    return;
  }
  if (request.url === "/rota/") {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      error: "INTERNAL_ERROR",
      message: "postgres://usuario:secreto@database/private"
    }));
    return;
  }
  if (request.url === "/excepcion/") {
    const error = new Error("No debe aparecer esta ruta /srv/private/app.mjs");
    error.code = "TEST_PRIVATE_FAILURE";
    throw error;
  }
  if (request.url === "/internal/desconocido") {
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
    return;
  }
  if (request.url === "/archivo-ausente.css") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("No encontrado");
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("No encontrado");
}

test("las navegaciones públicas reciben páginas 404 y 500 sin detalles internos", async (t) => {
  const logged = [];
  const web = await startServer(createPublicErrorPagesWebHandler({
    baseHandler,
    logger: {
      error(message, metadata) {
        logged.push({ message, metadata });
      }
    }
  }));
  t.after(() => new Promise((resolve) => web.server.close(resolve)));

  const missing = await fetch(`${web.baseUrl}/pieza-inexistente`, {
    headers: { Accept: "text/html" }
  });
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("content-type"), /^text\/html/);
  assert.equal(missing.headers.get("cache-control"), "no-store");
  assert.match(await missing.text(), /Esta pieza no está aquí/);

  const broken = await fetch(`${web.baseUrl}/rota/`, {
    headers: { Accept: "text/html" }
  });
  assert.equal(broken.status, 500);
  const brokenBody = await broken.text();
  assert.match(brokenBody, /Algo no ha salido bien/);
  assert.doesNotMatch(brokenBody, /postgres|secreto|database\/private/i);

  const unexpected = await fetch(`${web.baseUrl}/excepcion/`, {
    headers: { Accept: "text/html" }
  });
  assert.equal(unexpected.status, 500);
  const unexpectedBody = await unexpected.text();
  assert.match(unexpectedBody, /Algo no ha salido bien/);
  assert.doesNotMatch(unexpectedBody, /srv\/private|app\.mjs|TEST_PRIVATE_FAILURE/);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].metadata.code, "TEST_PRIVATE_FAILURE");
});

test("las páginas explícitas conservan el código HTTP y HEAD no devuelve cuerpo", async (t) => {
  const web = await startServer(createPublicErrorPagesWebHandler({ baseHandler }));
  t.after(() => new Promise((resolve) => web.server.close(resolve)));

  const explicit404 = await fetch(`${web.baseUrl}/404/`, { headers: { Accept: "text/html" } });
  assert.equal(explicit404.status, 404);
  assert.match(await explicit404.text(), /Esta pieza no está aquí/);

  const explicit500 = await fetch(`${web.baseUrl}/500/`, { headers: { Accept: "text/html" } });
  assert.equal(explicit500.status, 500);
  assert.match(await explicit500.text(), /Algo no ha salido bien/);

  const head = await fetch(`${web.baseUrl}/no-existe`, {
    method: "HEAD",
    headers: { Accept: "text/html" }
  });
  assert.equal(head.status, 404);
  assert.equal(await head.text(), "");
});

test("la capa preserva páginas correctas, JSON interno y errores de recursos", async (t) => {
  const web = await startServer(createPublicErrorPagesWebHandler({ baseHandler }));
  t.after(() => new Promise((resolve) => web.server.close(resolve)));

  const correct = await fetch(`${web.baseUrl}/correcta/`, {
    headers: { Accept: "text/html" }
  });
  assert.equal(correct.status, 200);
  assert.equal(correct.headers.get("x-test-header"), "preserved");
  assert.match(await correct.text(), /Página correcta/);

  const internal = await fetch(`${web.baseUrl}/internal/desconocido`, {
    headers: { Accept: "application/json" }
  });
  assert.equal(internal.status, 404);
  assert.match(internal.headers.get("content-type"), /^application\/json/);
  assert.deepEqual(await internal.json(), { error: "NOT_FOUND" });

  const asset = await fetch(`${web.baseUrl}/archivo-ausente.css`, {
    headers: { Accept: "text/css,*/*;q=0.1" }
  });
  assert.equal(asset.status, 404);
  assert.match(asset.headers.get("content-type"), /^text\/plain/);
  assert.equal(await asset.text(), "No encontrado");
});
