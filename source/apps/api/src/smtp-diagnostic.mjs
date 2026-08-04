import nodemailer from "nodemailer";

function required(name, { allowEmpty = false } = {}) {
  const value = String(process.env[name] ?? "").trim();
  if (!allowEmpty && !value) throw new Error(`${name}_MISSING`);
  return value;
}

function bool(name, fallback = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["true", "1", "yes", "on"].includes(raw)) return true;
  if (["false", "0", "no", "off"].includes(raw)) return false;
  throw new Error(`${name}_INVALID`);
}

function integer(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name}_INVALID`);
  return value;
}

const host = required("SMTP_HOST");
const port = integer("SMTP_PORT", 587);
const secure = bool("SMTP_SECURE", port === 465);
const requireTLS = bool("SMTP_REQUIRE_TLS", !secure);
const user = required("SMTP_USER", { allowEmpty: true });
const pass = String(process.env.SMTP_PASSWORD ?? "");
const from = required("SMTP_FROM");
const to = required("SMTP_TEST_TO");
const replyTo = required("SMTP_REPLY_TO", { allowEmpty: true });

if ((user && !pass) || (!user && pass)) throw new Error("SMTP_CREDENTIALS_INCOMPLETE");

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  requireTLS,
  pool: false,
  ...(user ? { auth: { user, pass } } : {}),
  connectionTimeout: Number.parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? "10000", 10),
  greetingTimeout: Number.parseInt(process.env.SMTP_GREETING_TIMEOUT_MS ?? "10000", 10),
  socketTimeout: Number.parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS ?? "30000", 10)
});

try {
  await transporter.verify();
  const result = await transporter.sendMail({
    from,
    to,
    ...(replyTo ? { replyTo } : {}),
    subject: "Prueba SMTP · Atelier Lumière",
    text: "La conexión SMTP del piloto funciona correctamente. Este mensaje no corresponde a un pedido real.",
    html: "<p>La conexión SMTP del piloto funciona correctamente.</p><p>Este mensaje no corresponde a un pedido real.</p>",
    headers: { "X-Atelier-Lumiere-Diagnostic": "true" }
  });
  console.log(JSON.stringify({
    ready: true,
    accepted: Array.isArray(result.accepted) ? result.accepted.length : 0,
    rejected: Array.isArray(result.rejected) ? result.rejected.length : 0,
    messageIdPresent: Boolean(result.messageId)
  }));
} catch (error) {
  console.error(JSON.stringify({
    ready: false,
    code: typeof error?.code === "string" ? error.code : "SMTP_DIAGNOSTIC_FAILED"
  }));
  process.exitCode = 1;
} finally {
  transporter.close();
}
