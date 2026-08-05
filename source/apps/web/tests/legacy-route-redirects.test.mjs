import test from "node:test";
import assert from "node:assert/strict";
import { createLegacyRouteRedirectWebHandler } from "../src/legacy-route-redirects.mjs";

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    ended: false,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = { ...headers };
      return this;
    },
    end() {
      this.ended = true;
      return this;
    }
  };
}

test("la ruta antigua /cuenta/ redirige al acceso real de talleres", async () => {
  let delegated = false;
  const handler = createLegacyRouteRedirectWebHandler({
    baseHandler: async () => {
      delegated = true;
    }
  });
  const response = createResponse();

  await handler({ method: "GET", url: "/cuenta/?origen=tienda" }, response);

  assert.equal(response.statusCode, 308);
  assert.equal(response.headers.Location, "/proveedor/acceso/?origen=tienda");
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.ended, true);
  assert.equal(delegated, false);
});

test("las demás rutas continúan hacia el handler principal", async () => {
  let delegatedUrl = null;
  const handler = createLegacyRouteRedirectWebHandler({
    baseHandler: async (request, response) => {
      delegatedUrl = request.url;
      response.writeHead(204, {});
      response.end();
    }
  });
  const response = createResponse();

  await handler({ method: "GET", url: "/tienda/" }, response);

  assert.equal(delegatedUrl, "/tienda/");
  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
});
