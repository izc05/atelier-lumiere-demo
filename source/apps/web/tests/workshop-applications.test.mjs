import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createWebHandler } from "../src/app.mjs";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

test("la solicitud pública llega a la API sin credenciales administrativas", async (t) => {
  let receivedAuthorization = "not-called";
  let receivedBody;
  const apiServer = createServer(async (request, response) => {
    receivedAuthorization = request.headers.authorization ?? null;
    let raw = "";
    for await (const chunk of request) raw += chunk;
    receivedBody = JSON.parse(raw);
    response.writeHead(201, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ application: { id: "00000000-0000-4000-8000-000000000501", status: "PENDING" } }));
  });
  const apiUrl = await listen(apiServer);
  const webServer = createServer(createWebHandler({ apiInternalUrl: apiUrl, logger: { error() {} } }));
  const webUrl = await listen(webServer);
  t.after(async () => { await close(webServer); await close(apiServer); });

  const page = await fetch(`${webUrl}/unete/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Háblanos de tu taller/);

  const response = await fetch(`${webUrl}/internal/workshop-applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: "Taller del Mar",
      contactName: "Ana Artesana",
      contactEmail: "ana@example.com",
      specialty: "Cerámica"
    })
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).application.status, "PENDING");
  assert.equal(receivedAuthorization, null);
  assert.equal(receivedBody.displayName, "Taller del Mar");
});

test("el formulario transmite la aceptación sin cambiar su presentación", async () => {
  const script = await readFile(new URL("../public/unete/join.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../public/unete/index.html", import.meta.url), "utf8");
  assert.match(html, /name="privacyAccepted"[^>]*required/);
  assert.match(script, /values\.privacyAccepted = form\.elements\.privacyAccepted\.checked/);
});

test("la bandeja de solicitudes exige sesión y oculta el token interno", async (t) => {
  const apiToken = "api-internal-token-not-visible-000000000000501";
  const accessKey = "clave-web-privada-de-prueba-00000501";
  let receivedAuthorization;
  const apiServer = createServer((request, response) => {
    receivedAuthorization = request.headers.authorization;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ applications: [] }));
  });
  const apiUrl = await listen(apiServer);
  const webServer = createServer(createWebHandler({
    apiInternalUrl: apiUrl,
    apiAdminToken: apiToken,
    enableAdminUi: true,
    adminAccessKey: accessKey,
    logger: { error() {} }
  }));
  const webUrl = await listen(webServer);
  t.after(async () => { await close(webServer); await close(apiServer); });

  const denied = await fetch(`${webUrl}/internal/admin/workshop-applications?status=PENDING`);
  assert.equal(denied.status, 401);
  const login = await fetch(`${webUrl}/internal/admin/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey })
  });
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];
  const list = await fetch(`${webUrl}/internal/admin/workshop-applications?status=PENDING`, {
    headers: { Cookie: cookie }
  });
  assert.equal(list.status, 200);
  assert.equal(receivedAuthorization, `Bearer ${apiToken}`);
  assert.equal((await list.text()).includes(apiToken), false);
});
