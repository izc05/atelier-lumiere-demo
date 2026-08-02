import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createWebHandler } from "../src/app.mjs";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function request(baseUrl, path, {
  method = "GET",
  body,
  cookie,
  redirect = "follow"
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    redirect,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { text };
  }
  return { response, payload };
}

test("la sesión del proveedor permanece en cookie HttpOnly y protege el panel", async (t) => {
  const sessionToken = "provider-session-token-secret-000000000000000001";
  let sessionActive = false;
  const received = [];

  const apiServer = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    received.push({
      method: request.method,
      path: request.url,
      authorization: request.headers.authorization ?? null,
      body: raw ? JSON.parse(raw) : null
    });

    let status = 404;
    let payload = { error: "NOT_FOUND" };

    if (request.method === "POST" && request.url === "/api/provider-auth/password") {
      status = 200;
      payload = {
        challengeToken: "provider-challenge-token-00000000000000000001",
        expiresAt: "2026-08-02T14:10:00.000Z",
        provider: { id: "00000000-0000-4000-8000-000000000201", displayName: "Taller privado" },
        methods: ["TOTP", "RECOVERY_CODE"],
        attemptsRemaining: 5
      };
    }

    if (request.method === "POST" && request.url === "/api/provider-auth/second-factor") {
      status = 200;
      sessionActive = true;
      payload = {
        sessionToken,
        expiresAt: "2026-08-03T02:00:00.000Z",
        provider: { id: "00000000-0000-4000-8000-000000000201", displayName: "Taller privado", status: "ACTIVE" },
        user: { id: "00000000-0000-4000-8000-000000000301", displayName: "Artesana" },
        membership: { id: "00000000-0000-4000-8000-000000000401", role: "PROVIDER_OWNER", status: "ACTIVE" }
      };
    }

    if (request.method === "GET" && request.url === "/api/provider/me") {
      if (sessionActive && request.headers.authorization === `Bearer ${sessionToken}`) {
        status = 200;
        payload = {
          context: {
            userId: "00000000-0000-4000-8000-000000000301",
            providerId: "00000000-0000-4000-8000-000000000201",
            role: "PROVIDER_OWNER"
          },
          session: { id: "00000000-0000-4000-8000-000000000501", expiresAt: "2026-08-03T02:00:00.000Z" },
          user: { id: "00000000-0000-4000-8000-000000000301", displayName: "Artesana", email: "artesana@atelier.example" },
          provider: { id: "00000000-0000-4000-8000-000000000201", displayName: "Taller privado", slug: "taller-privado", status: "ACTIVE" },
          membership: { role: "PROVIDER_OWNER", status: "ACTIVE" }
        };
      } else {
        status = 401;
        payload = { error: "UNAUTHORIZED", message: "Sesión no válida." };
      }
    }

    if (request.method === "POST" && request.url === "/api/provider-auth/logout") {
      sessionActive = false;
      status = 200;
      payload = { authenticated: false };
    }

    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  const apiUrl = await listen(apiServer);

  const currentTime = Date.parse("2026-08-02T14:00:00.000Z");
  const webServer = createServer(createWebHandler({
    apiInternalUrl: apiUrl,
    providerCookieSecure: true,
    now: () => currentTime,
    logger: { error() {} }
  }));
  const webUrl = await listen(webServer);

  t.after(async () => {
    await close(webServer);
    await close(apiServer);
  });

  const accessPage = await fetch(`${webUrl}/proveedor/acceso/`);
  assert.equal(accessPage.status, 200);
  const accessHtml = await accessPage.text();
  assert.match(accessHtml, /Atelier Lumière/);
  assert.match(accessHtml, /noindex,nofollow,noarchive/);

  const protectedWithoutCookie = await request(webUrl, "/proveedor/panel/", {
    redirect: "manual"
  });
  assert.equal(protectedWithoutCookie.response.status, 302);
  assert.equal(protectedWithoutCookie.response.headers.get("location"), "/proveedor/acceso/");

  const firstStep = await request(webUrl, "/internal/provider-auth/password", {
    method: "POST",
    body: { email: "artesana@atelier.example", password: "Clave-segura" }
  });
  assert.equal(firstStep.response.status, 200);
  assert.ok(firstStep.payload.challengeToken);
  assert.equal(received.at(-1).authorization, null);

  const secondStep = await request(webUrl, "/internal/provider-auth/second-factor", {
    method: "POST",
    body: {
      challengeToken: firstStep.payload.challengeToken,
      code: "123456"
    }
  });
  assert.equal(secondStep.response.status, 200);
  assert.equal(JSON.stringify(secondStep.payload).includes(sessionToken), false);
  const setCookie = secondStep.response.headers.get("set-cookie");
  assert.match(setCookie, /atelier_provider_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /Max-Age=43200/i);
  const cookie = setCookie.split(";", 1)[0];

  const session = await request(webUrl, "/internal/provider/session", { cookie });
  assert.equal(session.response.status, 200);
  assert.equal(session.payload.authenticated, true);
  assert.equal(session.payload.provider.displayName, "Taller privado");
  assert.equal(JSON.stringify(session.payload).includes(sessionToken), false);
  assert.equal(received.at(-1).authorization, `Bearer ${sessionToken}`);

  const protectedWithCookie = await request(webUrl, "/proveedor/panel/", {
    cookie,
    redirect: "manual"
  });
  assert.equal(protectedWithCookie.response.status, 200);
  assert.match(protectedWithCookie.payload.text, /Panel del proveedor/);

  const logout = await request(webUrl, "/internal/provider/session", {
    method: "DELETE",
    cookie
  });
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(received.at(-1).authorization, `Bearer ${sessionToken}`);

  const protectedAfterLogout = await request(webUrl, "/proveedor/panel/", {
    cookie,
    redirect: "manual"
  });
  assert.equal(protectedAfterLogout.response.status, 302);
});
