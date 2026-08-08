import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAdminProviderProfilesWebHandler } from "../src/admin-provider-profiles-proxy.mjs";

const TOKEN = "admin-profile-session-token-with-more-than-thirty-two-characters";
const COOKIE = `atelier_admin_session=${TOKEN}`;

async function start(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function baseHandler(request, response) {
  if (request.url === "/internal/admin/session") {
    const authenticated = String(request.headers.cookie ?? "").includes(COOKIE);
    response.writeHead(authenticated ? 200 : 401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ authenticated }));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<main>${request.url}</main>`);
}

test("los perfiles administrativos usan la sesión HttpOnly y no una credencial de desarrollo", async (t) => {
  const upstream = [];
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    upstream.push({
      path: target.pathname,
      authorization: options.headers?.Authorization ?? null
    });
    assert.equal(options.headers?.Authorization, `Bearer ${TOKEN}`);
    return Response.json({ profiles: [] });
  };

  assert.doesNotThrow(() => createAdminProviderProfilesWebHandler({
    baseHandler,
    enableAdminUi: true,
    apiInternalUrl: "http://api:4000",
    fetchImpl,
    logger: { error() {} }
  }));

  const handler = createAdminProviderProfilesWebHandler({
    baseHandler,
    enableAdminUi: true,
    apiInternalUrl: "http://api:4000",
    fetchImpl,
    logger: { error() {} }
  });
  const app = await start(handler);
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const unauthenticated = await fetch(`${app.baseUrl}/internal/admin/provider-profiles`);
  assert.equal(unauthenticated.status, 401);
  assert.equal(upstream.length, 0);

  const authenticated = await fetch(`${app.baseUrl}/internal/admin/provider-profiles`, {
    headers: { Cookie: COOKIE }
  });
  assert.equal(authenticated.status, 200);
  assert.deepEqual((await authenticated.json()).profiles, []);
  assert.equal(upstream.length, 1);
  assert.equal(upstream[0].path, "/api/admin/provider-profiles");
});

test("la revisión de perfiles desaparece cuando Administración está desactivada", async () => {
  const handler = createAdminProviderProfilesWebHandler({
    baseHandler,
    enableAdminUi: false,
    fetchImpl: async () => {
      throw new Error("No debe contactar con la API.");
    }
  });
  const app = await start(handler);
  try {
    const response = await fetch(`${app.baseUrl}/internal/admin/provider-profiles`);
    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
