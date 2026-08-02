import test from "node:test";
import assert from "node:assert/strict";
import { createMailService } from "../src/mail-service.mjs";

function fakeTransport() {
  const messages = [];
  return {
    messages,
    async verify() { return true; },
    async sendMail(message) {
      messages.push(message);
      return { messageId: `<${messages.length}@recovery.test>`, accepted: [message.to], rejected: [] };
    },
    close() {}
  };
}

function service(transport) {
  return createMailService({
    enabled: true,
    appUrl: "https://piloto.isivoltpro.es/atelier",
    host: "smtp.example.test",
    port: 587,
    secure: false,
    requireTls: true,
    from: "Atelier Lumière <noreply@example.test>",
    transport
  });
}

test("el correo de contraseña usa enlace de un solo uso y escapa contenido", async () => {
  const transport = fakeTransport();
  const mail = service(transport);
  const result = await mail.sendPasswordReset({
    to: "ana@example.test",
    displayName: "Ana <img src=x>",
    providerName: "Taller & Barro",
    token: "password-reset-token-000000000000000000000000001",
    expiresAt: "2026-08-02T15:00:00.000Z"
  });
  assert.equal(result.status, "SENT");
  const message = transport.messages[0];
  assert.match(message.subject, /Cambia la contraseña/);
  assert.match(message.text, /\/proveedor\/recuperar-clave\/\?token=/);
  assert.match(message.html, /Taller &amp; Barro/);
  assert.equal(message.html.includes("<img src=x>"), false);
  assert.match(message.html, /solo puede utilizarse una vez/);
});

test("el correo de recuperación 2FA no incluye códigos ni secretos", async () => {
  const transport = fakeTransport();
  const mail = service(transport);
  const result = await mail.sendTwoFactorReset({
    to: "ana@example.test",
    displayName: "Ana",
    providerName: "Taller privado",
    token: "two-factor-reset-token-0000000000000000000000001",
    expiresAt: "2026-08-02T15:00:00.000Z"
  });
  assert.equal(result.status, "SENT");
  const serialized = JSON.stringify(transport.messages[0]);
  assert.match(serialized, /recuperar-2fa/);
  assert.match(serialized, /autenticador anterior/);
  assert.equal(serialized.includes("otpauth://"), false);
  assert.equal(serialized.includes("recoveryCodes"), false);
});

test("el servicio desactivado cubre también la recuperación", async () => {
  const mail = createMailService({ enabled: false });
  assert.equal((await mail.sendPasswordReset()).status, "DISABLED");
  assert.equal((await mail.sendTwoFactorReset()).status, "DISABLED");
});
