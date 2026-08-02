import test from "node:test";
import assert from "node:assert/strict";
import { createMailService } from "../src/mail-service.mjs";

function fakeTransport() {
  const messages = [];
  let verified = false;
  let closed = false;
  return {
    messages,
    get verified() {
      return verified;
    },
    get closed() {
      return closed;
    },
    async verify() {
      verified = true;
      return true;
    },
    async sendMail(message) {
      messages.push(message);
      return {
        messageId: `<${messages.length}@atelier.test>`,
        accepted: [message.to],
        rejected: []
      };
    },
    close() {
      closed = true;
    }
  };
}

function enabledService(transport) {
  return createMailService({
    enabled: true,
    appUrl: "https://piloto.isivoltpro.es/atelier",
    host: "smtp.example.test",
    port: 587,
    secure: false,
    requireTls: true,
    user: "smtp-user",
    password: "smtp-secret",
    from: "Atelier Lumière <noreply@example.test>",
    replyTo: "ayuda@example.test",
    transport
  });
}

test("SMTP permanece desactivado hasta habilitarlo expresamente", async () => {
  const service = createMailService({ enabled: false });
  assert.equal(service.enabled, false);
  assert.deepEqual(await service.verify(), { enabled: false, ready: false });
  assert.equal((await service.sendInvitation()).status, "DISABLED");
});

test("la invitación incluye enlace absoluto, texto y HTML escapado", async () => {
  const transport = fakeTransport();
  const service = enabledService(transport);
  const result = await service.sendInvitation({
    to: "ARTESANA@EXAMPLE.TEST",
    contactName: "Ana <script>alert(1)</script>",
    providerName: "Taller & Barro",
    token: "invitation-token-000000000000000000000000000001",
    expiresAt: "2026-08-04T12:00:00.000Z"
  });

  assert.equal(result.status, "SENT");
  assert.equal(result.messageId, "<1@atelier.test>");
  assert.deepEqual(result.accepted, ["artesana@example.test"]);
  assert.equal(transport.messages.length, 1);

  const message = transport.messages[0];
  assert.equal(message.to, "artesana@example.test");
  assert.match(message.subject, /Taller & Barro/);
  assert.match(message.text, /https:\/\/piloto\.isivoltpro\.es\/proveedor\/activar\/\?token=/);
  assert.match(message.html, /Taller &amp; Barro/);
  assert.equal(message.html.includes("<script>alert(1)</script>"), false);
  assert.match(message.html, /Ana &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(message.headers["X-Atelier-Lumiere-Transactional"], "true");
});

test("la verificación de correo usa una ruta distinta y el transporte se puede verificar y cerrar", async () => {
  const transport = fakeTransport();
  const service = enabledService(transport);

  assert.deepEqual(await service.verify(), { enabled: true, ready: true });
  assert.equal(transport.verified, true);

  const result = await service.sendEmailVerification({
    to: "ana@example.test",
    displayName: "Ana",
    providerName: "Taller privado",
    token: "verification-token-00000000000000000000000000001",
    expiresAt: "2026-08-03T12:00:00.000Z"
  });

  assert.equal(result.status, "SENT");
  assert.match(transport.messages[0].text, /\/proveedor\/verificar-correo\/\?token=/);
  assert.match(transport.messages[0].subject, /Verifica tu correo/);

  service.close();
  assert.equal(transport.closed, true);
});

test("la configuración SMTP rechaza credenciales incompletas y URLs no seguras", () => {
  assert.throws(
    () => createMailService({
      enabled: true,
      appUrl: "file:///tmp/atelier",
      host: "smtp.example.test",
      port: 587,
      from: "Atelier <noreply@example.test>",
      transport: fakeTransport()
    }),
    /APP_URL/
  );

  assert.throws(
    () => createMailService({
      enabled: true,
      appUrl: "https://atelier.example.test",
      host: "smtp.example.test",
      port: 587,
      user: "solo-usuario",
      from: "Atelier <noreply@example.test>",
      transport: fakeTransport()
    }),
    /SMTP_USER y SMTP_PASSWORD/
  );
});
