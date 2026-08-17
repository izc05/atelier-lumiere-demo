import test from "node:test";
import assert from "node:assert/strict";
import { createPilotCheckoutApiHandler } from "../src/pilot-checkout-api.mjs";

function request(payload, url = "/api/pilot-checkout/submit") {
  return {
    method: "POST",
    url,
    headers: { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(payload));
    }
  };
}

function responseRecorder() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk = "") {
      this.body += String(chunk);
    }
  };
}

test("la API traduce la restricción de un solo proveedor", async () => {
  const response = responseRecorder();
  const logged = [];
  const handler = createPilotCheckoutApiHandler({
    baseHandler() {
      throw new Error("No debe ejecutarse el handler base.");
    },
    pilotCheckoutService: {
      async submit() {
        throw Object.assign(new Error("checkout_batch_must_use_single_provider"), {
          code: "23514",
          constraint: "provider_orders_single_provider_checkout"
        });
      }
    },
    logger: { error(...args) { logged.push(args); } }
  });

  await handler(request({ idempotencyKey: "test" }), response);

  assert.equal(response.statusCode, 409);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.deepEqual(JSON.parse(response.body), {
    error: "CHECKOUT_PROVIDER_MISMATCH",
    message: "Cada compra debe contener artículos de un único taller. Finaliza este pedido antes de comprar a otro proveedor."
  });
  assert.equal(logged.length, 0);
});

test("la API de recuperación devuelve siempre una aceptación genérica", async () => {
  const response = responseRecorder();
  const received = [];
  const generic = {
    accepted: true,
    message: "Si los datos corresponden a un pedido, enviaremos un nuevo enlace privado al correo de compra."
  };
  const handler = createPilotCheckoutApiHandler({
    baseHandler() {
      throw new Error("No debe ejecutarse el handler base.");
    },
    pilotCheckoutService: {
      async requestCustomerAccessRecovery(input) {
        received.push(input);
        return generic;
      }
    }
  });

  await handler(request(
    { email: "cliente@example.test", orderNumber: "AL-2026-PRUEBA" },
    "/api/pilot-checkout/access-recovery"
  ), response);

  assert.equal(response.statusCode, 202);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.deepEqual(JSON.parse(response.body), generic);
  assert.deepEqual(received, [{ email: "cliente@example.test", orderNumber: "AL-2026-PRUEBA" }]);
});
