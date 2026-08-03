import test from "node:test";
import assert from "node:assert/strict";
import { withSandboxPayment } from "../src/payment-checkout-integration.mjs";

test("el checkout conserva su resultado y adjunta la sesión sandbox", async () => {
  const calls = [];
  const service = withSandboxPayment({
    checkoutService: {
      enabled: true,
      async submit(input) {
        calls.push(input);
        return { checkoutId: "00000000-0000-4000-8000-000000000501", orders: [{ id: "order" }] };
      }
    },
    paymentSandboxService: {
      enabled: true,
      async createForCheckout(checkoutId) {
        assert.equal(checkoutId, "00000000-0000-4000-8000-000000000501");
        return { mode: "SANDBOX", status: "CREATED", sessionPath: "/pago/sandbox/?token=test" };
      }
    }
  });

  const result = await service.submit({ customer: "test" });
  assert.deepEqual(calls, [{ customer: "test" }]);
  assert.equal(result.orders[0].id, "order");
  assert.equal(result.payment.mode, "SANDBOX");
});

test("el checkout sigue siendo válido si el sandbox está apagado o falla", async () => {
  const base = {
    enabled: true,
    async submit() {
      return { checkoutId: "00000000-0000-4000-8000-000000000502", orders: [] };
    }
  };

  const disabled = withSandboxPayment({
    checkoutService: base,
    paymentSandboxService: { enabled: false }
  });
  assert.equal((await disabled.submit({})).payment, null);

  const failures = [];
  const unavailable = withSandboxPayment({
    checkoutService: base,
    paymentSandboxService: {
      enabled: true,
      async createForCheckout() {
        const error = new Error("fallo intencionado");
        error.code = "SANDBOX_TEST_FAILURE";
        throw error;
      }
    },
    logger: { error(message, metadata) { failures.push({ message, metadata }); } }
  });
  const result = await unavailable.submit({});
  assert.equal(result.payment.status, "UNAVAILABLE");
  assert.equal(failures[0].metadata.code, "SANDBOX_TEST_FAILURE");
});
