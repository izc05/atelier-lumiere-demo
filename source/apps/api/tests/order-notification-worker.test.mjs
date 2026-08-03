import test from "node:test";
import assert from "node:assert/strict";
import { createMailService } from "../src/mail-service.mjs";
import { createOrderNotificationEmail } from "../src/order-notification-email-templates.mjs";
import { createOrderNotificationWorker } from "../src/order-notification-worker.mjs";

const CONTEXT = Object.freeze({
  role: "NOTIFICATION_SERVICE",
  userId: "00000000-0000-4000-8000-000000000010",
  providerId: null
});

function fakeDatabase({ attempts = 1 } = {}) {
  let available = true;
  const updates = [];
  return {
    updates,
    async withContext(context, callback) {
      assert.equal(context.role, "NOTIFICATION_SERVICE");
      return callback({
        async query(sql, values = []) {
          if (sql.includes("WITH candidates")) {
            if (!available) return { rows: [] };
            available = false;
            return { rows: [{ id: 41, attempts }] };
          }
          if (sql.includes("app.notification_delivery")) {
            assert.deepEqual(values, [41]);
            return {
              rows: [{
                id: 41,
                attempts,
                event_type: "ORDER_STATUS_SHIPPED",
                template_key: "ORDER_STATUS",
                order_id: "00000000-0000-4000-8000-000000000501",
                order_number: "AL-ORDER-TEST-0001",
                provider_name: "Taller <Luz>",
                recipient_email: "CLIENTE@EXAMPLE.TEST",
                recipient_name: "Ana <Cliente>",
                recipient_kind: "CUSTOMER"
              }]
            };
          }
          if (sql.includes("SET status = 'SENT'")) {
            updates.push({ type: "sent", values });
            return { rows: [] };
          }
          if (sql.includes("SET status = $2")) {
            updates.push({ type: "failed", values });
            return { rows: [] };
          }
          throw new Error(`Consulta inesperada: ${sql}`);
        }
      });
    }
  };
}

function transport() {
  const messages = [];
  return {
    messages,
    async verify() { return true; },
    async sendMail(message) {
      messages.push(message);
      return { messageId: message.messageId, accepted: [message.to], rejected: [] };
    },
    close() {}
  };
}

function mailService(fakeTransport) {
  return createMailService({
    enabled: true,
    appUrl: "https://atelier.example.test",
    host: "smtp.example.test",
    port: 587,
    secure: false,
    requireTls: true,
    from: "Atelier Lumière <noreply@example.test>",
    transport: fakeTransport
  });
}

test("la plantilla no incluye datos privados y escapa contenido", () => {
  const template = createOrderNotificationEmail({
    recipientName: "Ana <script>",
    recipientKind: "CUSTOMER",
    providerName: "Taller & Barro",
    orderNumber: "AL-ORDER-TEST-0001",
    eventType: "CUSTOM_REQUEST_STATUS_QUOTED",
    actionUrl: "https://atelier.example.test/mis-pedidos/detalle/?id=00000000-0000-4000-8000-000000000501"
  });
  assert.match(template.subject, /Presupuesto disponible/);
  assert.match(template.text, /área privada|seguimiento privado/);
  assert.match(template.html, /Ana &lt;script&gt;/);
  assert.match(template.html, /Taller &amp; Barro/);
  assert.equal(template.html.includes("<script>"), false);
  assert.doesNotMatch(template.text, /dirección de envío|número de tarjeta|fecha de caducidad|CVV|IBAN/i);
  assert.match(template.text, /nunca solicita datos de tarjeta por email/i);
});

test("el trabajador entrega una vez y marca la cola como enviada", async () => {
  const database = fakeDatabase();
  const fakeTransport = transport();
  const worker = createOrderNotificationWorker({
    database,
    systemContext: CONTEXT,
    mailService: mailService(fakeTransport),
    enabled: true,
    intervalMs: 5000,
    batchSize: 10,
    maxAttempts: 5,
    logger: { error() {} }
  });

  const first = await worker.runOnce();
  const second = await worker.runOnce();
  assert.deepEqual(first, [{ id: 41, status: "SENT" }]);
  assert.deepEqual(second, []);
  assert.equal(fakeTransport.messages.length, 1);
  assert.equal(fakeTransport.messages[0].to, "cliente@example.test");
  assert.equal(fakeTransport.messages[0].messageId, "<order-notification-41@atelier-lumiere.invalid>");
  assert.equal(fakeTransport.messages[0].headers["X-Atelier-Lumiere-Notification"], "41");
  assert.match(fakeTransport.messages[0].text, /\/mis-pedidos\/detalle\/\?id=/);
  assert.deepEqual(database.updates[0], {
    type: "sent",
    values: [41, "<order-notification-41@atelier-lumiere.invalid>"]
  });
});

test("un fallo final se registra sin guardar el mensaje del error", async () => {
  const database = fakeDatabase({ attempts: 5 });
  const logs = [];
  const worker = createOrderNotificationWorker({
    database,
    systemContext: CONTEXT,
    mailService: {
      enabled: true,
      async sendOrderNotification() {
        throw Object.assign(new Error("respuesta SMTP con datos sensibles"), { code: "ECONNECTION" });
      }
    },
    enabled: true,
    intervalMs: 5000,
    batchSize: 1,
    maxAttempts: 5,
    logger: { error(message, context) { logs.push({ message, context }); } }
  });

  assert.deepEqual(await worker.runOnce(), [{ id: 41, status: "FAILED", errorCode: "ECONNECTION" }]);
  assert.equal(database.updates[0].values[1], "FAILED");
  assert.equal(database.updates[0].values[2], "ECONNECTION");
  assert.equal(JSON.stringify(logs).includes("datos sensibles"), false);
});
