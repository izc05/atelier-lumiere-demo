import test from "node:test";
import assert from "node:assert/strict";
import {
  createAuthenticationServiceContext,
  createPilotCheckoutServiceContext
} from "../apps/api/src/auth-context.mjs";
import { createProviderOnboardingService } from "../apps/api/src/provider-onboarding-service.mjs";
import { createEmailVerificationService } from "../apps/api/src/email-verification-service.mjs";
import { createCustomerAuthService } from "../apps/api/src/customer-auth-service.mjs";
import { createPilotCheckoutService } from "../apps/api/src/pilot-checkout-service.mjs";
import { createPaymentSandboxService } from "../apps/api/src/payment-sandbox-service.mjs";

const database = { async withContext() { throw new Error("not used"); } };
const auth = createAuthenticationServiceContext();
const pilot = createPilotCheckoutServiceContext();

test("los contextos internos de producción son roles técnicos sin taller", () => {
  assert.deepEqual(auth, {
    role: "AUTH_SERVICE",
    userId: "00000000-0000-4000-8000-000000000008",
    providerId: null,
    authenticationMode: "internal-authentication-service"
  });
  assert.deepEqual(pilot, {
    role: "PILOT_CHECKOUT_SERVICE",
    userId: "00000000-0000-4000-8000-000000000011",
    providerId: null,
    authenticationMode: "internal-pilot-checkout-service"
  });
});

test("incorporación, verificación y acceso del cliente aceptan AUTH_SERVICE", () => {
  assert.ok(createProviderOnboardingService({ database, systemContext: auth }));
  assert.ok(createEmailVerificationService({ database, systemContext: auth }));
  assert.ok(createCustomerAuthService({ database, systemContext: auth }));
});

test("el checkout acepta exclusivamente su servicio técnico o Administración", () => {
  const customerAuthService = { async issueAccess() {} };
  const mailService = { async sendCustomerOrderAccess() {} };
  assert.ok(createPilotCheckoutService({
    database,
    systemContext: pilot,
    customerAuthService,
    mailService,
    enabled: false
  }));
  assert.throws(() => createPilotCheckoutService({
    database,
    systemContext: auth,
    customerAuthService,
    mailService,
    enabled: false
  }), /contexto interno/i);
});

test("el pago sandbox puede ejecutarse en producción solo con modo piloto explícito", () => {
  const context = {
    role: "PAYMENT_SERVICE",
    userId: "00000000-0000-4000-8000-000000000009",
    providerId: null
  };
  const base = {
    database,
    systemContext: context,
    enabled: true,
    environment: "production",
    sessionSecret: "a".repeat(32)
  };
  assert.equal(createPaymentSandboxService({ ...base, pilotModeEnabled: false }).enabled, false);
  assert.equal(createPaymentSandboxService({ ...base, pilotModeEnabled: true }).enabled, true);
});
