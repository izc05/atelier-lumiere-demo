import nodemailer from "nodemailer";
import { createCustomerOrderAccessEmail } from "./customer-order-email-templates.mjs";
import {
  createInvitationEmail,
  createVerificationEmail
} from "./email-templates.mjs";
import {
  createPasswordResetEmail,
  createTwoFactorResetEmail
} from "./recovery-email-templates.mjs";

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new TypeError("El valor booleano de SMTP no es válido.");
}

function integerValue(value, fallback, { min, max, field }) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new TypeError(`${field} debe estar entre ${min} y ${max}.`);
  }
  return parsed;
}

function requiredString(value, field, min = 1, max = 500) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < min || normalized.length > max) {
    throw new TypeError(`${field} no es válido.`);
  }
  return normalized;
}

function applicationUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("APP_URL debe ser una URL absoluta.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new TypeError("APP_URL debe utilizar HTTP o HTTPS y no incluir credenciales.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function actionUrl(baseUrl, pathname, token) {
  const url = new URL(pathname, `${baseUrl.toString().replace(/\/$/, "")}/`);
  url.searchParams.set("token", requiredString(token, "token", 32, 180));
  return url.toString();
}

function customerAccessUrl(baseUrl, token) {
  const url = new URL("/pedido/acceso/", `${baseUrl.toString().replace(/\/$/, "")}/`);
  url.hash = `token=${encodeURIComponent(requiredString(token, "token", 32, 180))}`;
  return url.toString();
}

function disabledService() {
  const disabled = async () => ({ status: "DISABLED", messageId: null, accepted: [] });
  return Object.freeze({
    enabled: false,
    async verify() {
      return { enabled: false, ready: false };
    },
    sendInvitation: disabled,
    sendEmailVerification: disabled,
    sendPasswordReset: disabled,
    sendTwoFactorReset: disabled,
    sendAdminRecovery: disabled,
    sendCustomerOrderAccess: disabled,
    close() {}
  });
}

function deliveryResult(info) {
  return {
    status: "SENT",
    messageId: typeof info?.messageId === "string" ? info.messageId : null,
    accepted: Array.isArray(info?.accepted) ? info.accepted.map(String) : [],
    rejected: Array.isArray(info?.rejected) ? info.rejected.map(String) : []
  };
}

export function createMailService({
  enabled = booleanValue(process.env.SMTP_ENABLED, false),
  appUrl = process.env.APP_URL ?? "http://localhost:3000",
  host = process.env.SMTP_HOST,
  port = process.env.SMTP_PORT,
  secure = process.env.SMTP_SECURE,
  requireTls = process.env.SMTP_REQUIRE_TLS,
  user = process.env.SMTP_USER,
  password = process.env.SMTP_PASSWORD,
  from = process.env.SMTP_FROM,
  replyTo = process.env.SMTP_REPLY_TO,
  connectionTimeoutMs = process.env.SMTP_CONNECTION_TIMEOUT_MS,
  greetingTimeoutMs = process.env.SMTP_GREETING_TIMEOUT_MS,
  socketTimeoutMs = process.env.SMTP_SOCKET_TIMEOUT_MS,
  transport
} = {}) {
  if (!booleanValue(enabled, false)) return disabledService();

  const baseUrl = applicationUrl(appUrl);
  const sender = requiredString(from, "SMTP_FROM", 3, 320);
  const smtpHost = requiredString(host, "SMTP_HOST", 1, 253);
  const smtpPort = integerValue(port, 587, { min: 1, max: 65535, field: "SMTP_PORT" });
  const smtpSecure = booleanValue(secure, smtpPort === 465);
  const smtpRequireTls = booleanValue(requireTls, !smtpSecure);
  const smtpUser = typeof user === "string" ? user.trim() : "";
  const smtpPassword = typeof password === "string" ? password : "";

  if ((smtpUser && !smtpPassword) || (!smtpUser && smtpPassword)) {
    throw new TypeError("SMTP_USER y SMTP_PASSWORD deben configurarse juntos.");
  }

  const transporter = transport ?? nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    requireTLS: smtpRequireTls,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPassword } } : {}),
    connectionTimeout: integerValue(connectionTimeoutMs, 10000, {
      min: 1000,
      max: 60000,
      field: "SMTP_CONNECTION_TIMEOUT_MS"
    }),
    greetingTimeout: integerValue(greetingTimeoutMs, 10000, {
      min: 1000,
      max: 60000,
      field: "SMTP_GREETING_TIMEOUT_MS"
    }),
    socketTimeout: integerValue(socketTimeoutMs, 30000, {
      min: 5000,
      max: 120000,
      field: "SMTP_SOCKET_TIMEOUT_MS"
    })
  });

  async function send({ to, template }) {
    const recipient = requiredString(to, "destinatario", 3, 254).toLowerCase();
    const info = await transporter.sendMail({
      from: sender,
      to: recipient,
      ...(replyTo ? { replyTo: requiredString(replyTo, "SMTP_REPLY_TO", 3, 320) } : {}),
      subject: template.subject,
      text: template.text,
      html: template.html,
      headers: {
        "X-Atelier-Lumiere-Transactional": "true",
        "X-Auto-Response-Suppress": "All"
      }
    });
    return deliveryResult(info);
  }

  function recoveryTemplate({
    type,
    displayName,
    providerName,
    token,
    expiresAt,
    pathname
  }) {
    const input = {
      displayName,
      providerName,
      actionUrl: actionUrl(
        baseUrl,
        pathname ?? (type === "PASSWORD" ? "/proveedor/recuperar-clave/" : "/proveedor/recuperar-2fa/"),
        token
      ),
      expiresAt
    };
    return type === "PASSWORD"
      ? createPasswordResetEmail(input)
      : createTwoFactorResetEmail(input);
  }

  return Object.freeze({
    enabled: true,

    async verify() {
      await transporter.verify();
      return { enabled: true, ready: true };
    },

    async sendInvitation({ to, contactName, providerName, token, expiresAt }) {
      const template = createInvitationEmail({
        contactName,
        providerName,
        actionUrl: actionUrl(baseUrl, "/proveedor/activar/", token),
        expiresAt
      });
      return send({ to, template });
    },

    async sendEmailVerification({ to, displayName, providerName, token, expiresAt }) {
      const template = createVerificationEmail({
        displayName,
        providerName,
        actionUrl: actionUrl(baseUrl, "/proveedor/verificar-correo/", token),
        expiresAt
      });
      return send({ to, template });
    },

    async sendPasswordReset({ to, displayName, providerName, token, expiresAt }) {
      return send({
        to,
        template: recoveryTemplate({
          type: "PASSWORD",
          displayName,
          providerName,
          token,
          expiresAt
        })
      });
    },

    async sendTwoFactorReset({ to, displayName, providerName, token, expiresAt }) {
      return send({
        to,
        template: recoveryTemplate({
          type: "TWO_FACTOR",
          displayName,
          providerName,
          token,
          expiresAt
        })
      });
    },

    async sendAdminRecovery({ to, displayName, token, expiresAt }) {
      return send({
        to,
        template: recoveryTemplate({
          type: "TWO_FACTOR",
          displayName,
          providerName: "Administración de Atelier Lumière",
          token,
          expiresAt,
          pathname: "/admin/recuperar/"
        })
      });
    },

    async sendCustomerOrderAccess({
      to,
      displayName,
      token,
      expiresAt,
      orderNumbers
    }) {
      return send({
        to,
        template: createCustomerOrderAccessEmail({
          displayName,
          accessLink: customerAccessUrl(baseUrl, token),
          expiresAt,
          orderNumbers
        })
      });
    },

    close() {
      if (typeof transporter.close === "function") transporter.close();
    }
  });
}
