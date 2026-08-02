import test from "node:test";
import assert from "node:assert/strict";
import {
  withOnboardingEmailDelivery,
  withProviderInvitationDelivery
} from "../src/email-delivery-services.mjs";

const context = { userId: "00000000-0000-4000-8000-000000000001", role: "ADMIN" };

function providerResult() {
  return {
    provider: {
      id: "00000000-0000-4000-8000-000000000201",
      displayName: "Taller de prueba",
      contactName: "Ana",
      contactEmail: "ana@example.test"
    },
    invitation: {
      id: "00000000-0000-4000-8000-000000000301",
      email: "ana@example.test",
      expiresAt: "2026-08-04T12:00:00.000Z"
    },
    token: "invitation-token-000000000000000000000000000001"
  };
}

test("la invitación se envía después de que el servicio base haya terminado", async () => {
  const order = [];
  const base = {
    async create() {
      order.push("database-committed");
      return providerResult();
    },
    async list() {
      return [];
    },
    async setStatus() {},
    async audit() {},
    async renewInvitation() {}
  };
  const mailService = {
    enabled: true,
    async sendInvitation(input) {
      order.push("email-sent");
      assert.equal(input.providerName, "Taller de prueba");
      assert.equal(input.contactName, "Ana");
      return { status: "SENT", messageId: "message-1", accepted: [input.to] };
    }
  };

  const service = withProviderInvitationDelivery({ providersService: base, mailService });
  const result = await service.create(context, {});
  assert.deepEqual(order, ["database-committed", "email-sent"]);
  assert.equal(result.emailDelivery.status, "SENT");
});

test("un fallo SMTP no revierte el alta ya confirmada ni devuelve secretos en el error", async () => {
  const logged = [];
  const base = {
    async create() {
      return providerResult();
    },
    async list() {
      return [];
    },
    async setStatus() {},
    async audit() {},
    async renewInvitation() {}
  };
  const mailService = {
    enabled: true,
    async sendInvitation() {
      const error = new Error("No se pudo conectar");
      error.code = "ETIMEDOUT";
      throw error;
    }
  };
  const logger = { error(message, metadata) { logged.push({ message, metadata }); } };

  const service = withProviderInvitationDelivery({ providersService: base, mailService, logger });
  const result = await service.create(context, {});
  assert.equal(result.provider.displayName, "Taller de prueba");
  assert.deepEqual(result.emailDelivery, {
    status: "FAILED",
    messageId: null,
    accepted: [],
    rejected: [],
    errorCode: "ETIMEDOUT"
  });
  assert.equal(JSON.stringify(logged).includes(result.token), false);
});

test("aceptar la invitación envía la verificación sin modificar el resultado funcional", async () => {
  const base = {
    async preview() {
      return { available: true };
    },
    async accept() {
      return {
        provider: {
          id: "00000000-0000-4000-8000-000000000201",
          displayName: "Taller de prueba"
        },
        user: {
          id: "00000000-0000-4000-8000-000000000401",
          email: "ana@example.test",
          displayName: "Ana"
        },
        emailVerification: {
          id: "00000000-0000-4000-8000-000000000501",
          expiresAt: "2026-08-03T12:00:00.000Z"
        },
        verificationToken: "verification-token-00000000000000000000000000001",
        accessGranted: false
      };
    }
  };
  const sent = [];
  const mailService = {
    enabled: true,
    async sendEmailVerification(input) {
      sent.push(input);
      return { status: "SENT", messageId: "message-2", accepted: [input.to] };
    }
  };

  const service = withOnboardingEmailDelivery({ onboardingService: base, mailService });
  const result = await service.accept({});
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ana@example.test");
  assert.equal(result.accessGranted, false);
  assert.equal(result.emailDelivery.status, "SENT");
});

test("el listado administrativo calcula el progreso desde PostgreSQL", async () => {
  const providerId = "00000000-0000-4000-8000-000000000201";
  const base = {
    async list() {
      return [{
        id: providerId,
        displayName: "Taller listo",
        status: "INVITED",
        latestInvitation: { status: "ACCEPTED" }
      }];
    },
    async create() {},
    async setStatus() {},
    async audit() {},
    async renewInvitation() {}
  };
  const database = {
    async withContext(receivedContext, operation) {
      assert.equal(receivedContext, context);
      return operation({
        async query(sql) {
          assert.match(sql, /provider_members/);
          assert.match(sql, /two_factor_enabled/);
          return {
            rows: [{
              provider_id: providerId,
              user_id: "00000000-0000-4000-8000-000000000401",
              user_status: "ACTIVE",
              email_verified_at: "2026-08-02T10:00:00.000Z",
              two_factor_enabled: true,
              membership_status: "ACTIVE",
              membership_role: "PROVIDER_OWNER"
            }]
          };
        }
      });
    }
  };

  const service = withProviderInvitationDelivery({
    providersService: base,
    mailService: { enabled: false },
    database
  });
  const providers = await service.list(context);
  assert.equal(providers[0].onboarding.stage, "PENDING_APPROVAL");
  assert.equal(providers[0].onboarding.accountCreated, true);
  assert.equal(providers[0].onboarding.emailVerified, true);
  assert.equal(providers[0].onboarding.twoFactorEnabled, true);
  assert.equal(providers[0].onboarding.approved, false);
});
