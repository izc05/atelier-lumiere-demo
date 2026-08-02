const BRAND = "Atelier Lumière";
const TAGLINE = "Artesanía para celebrar";

function requiredText(value, field, max = 300) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) throw new TypeError(`${field} no es válido.`);
  return normalized;
}

function safeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("El enlace de recuperación no es válido.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new TypeError("El enlace de recuperación no es seguro.");
  }
  return url.toString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatExpiry(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("La caducidad no es válida.");
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Madrid"
  }).format(date);
}

function layout({ preview, heading, greeting, paragraphs, actionLabel, actionUrl, expiry, warning }) {
  const paragraphHtml = paragraphs
    .map((paragraph) => `<p style="margin:0 0 18px;color:#493a3e;font-size:16px;line-height:1.7">${escapeHtml(paragraph)}</p>`)
    .join("");
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;background:#f6eee3;color:#291b1e;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6eee3;padding:32px 14px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf9;border:1px solid #eadbca;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(59,9,20,.08)">
        <tr><td style="padding:28px 34px;background:#5a0f1f;color:#fffaf4">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.1">${BRAND}</div>
          <div style="margin-top:7px;color:#e7d3a2;font-size:12px;letter-spacing:.12em;text-transform:uppercase">${TAGLINE}</div>
        </td></tr>
        <tr><td style="padding:38px 34px 34px">
          <p style="margin:0 0 12px;color:#7b2638;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Recuperación segura</p>
          <h1 style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:400;line-height:1.15;color:#3b0914">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 18px;color:#291b1e;font-size:16px;line-height:1.7">${escapeHtml(greeting)}</p>
          ${paragraphHtml}
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0"><tr><td style="border-radius:999px;background:#5a0f1f">
            <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 24px;color:#fffaf4;text-decoration:none;font-size:15px;font-weight:700">${escapeHtml(actionLabel)}</a>
          </td></tr></table>
          <p style="margin:0 0 8px;color:#74666a;font-size:13px;line-height:1.6">Este enlace caduca el ${escapeHtml(expiry)} y solo puede utilizarse una vez.</p>
          <p style="margin:0;color:#74666a;font-size:13px;line-height:1.6">Si el botón no funciona, copia este enlace:</p>
          <p style="margin:8px 0 0;word-break:break-all;color:#5a0f1f;font-size:12px;line-height:1.6">${escapeHtml(actionUrl)}</p>
        </td></tr>
        <tr><td style="padding:22px 34px;border-top:1px solid #eee2d3;background:#fbf7f0;color:#74666a;font-size:12px;line-height:1.6">
          ${escapeHtml(warning)}<br>${BRAND} · ${TAGLINE}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function createRecoveryEmail({
  displayName,
  providerName,
  actionUrl,
  expiresAt,
  type
}) {
  const name = requiredText(displayName, "displayName", 120);
  const provider = requiredText(providerName, "providerName", 140);
  const url = safeUrl(actionUrl);
  const expiry = formatExpiry(expiresAt);
  const passwordReset = type === "PASSWORD";
  const subject = passwordReset
    ? `Cambia la contraseña de ${provider}`
    : `Sustituye el doble factor de ${provider}`;
  const heading = passwordReset ? "Crea una contraseña nueva" : "Configura un autenticador nuevo";
  const paragraphs = passwordReset
    ? [
        `Hemos recibido una solicitud para cambiar la contraseña de la cuenta responsable de ${provider}.`,
        "Al completar el cambio se cerrarán todas las sesiones anteriores. El doble factor seguirá siendo obligatorio."
      ]
    : [
        `Hemos recibido una solicitud para sustituir el doble factor de la cuenta responsable de ${provider}.`,
        "Al continuar se invalidarán el autenticador anterior, los códigos de recuperación y todas las sesiones abiertas. Tendrás que escanear un QR nuevo."
      ];
  const actionLabel = passwordReset ? "Cambiar mi contraseña" : "Sustituir mi autenticador";
  const warning = passwordReset
    ? "Si no solicitaste este cambio, ignora el mensaje y tu contraseña seguirá igual."
    : "Si todavía conservas el autenticador o un código de recuperación, no necesitas utilizar este enlace.";

  return {
    subject,
    text: [
      `${BRAND} — ${TAGLINE}`,
      "",
      `Hola ${name}:`,
      ...paragraphs,
      "",
      `${actionLabel}: ${url}`,
      `Caduca: ${expiry}`,
      "",
      warning
    ].join("\n"),
    html: layout({
      preview: subject,
      heading,
      greeting: `Hola ${name}:`,
      paragraphs,
      actionLabel,
      actionUrl: url,
      expiry,
      warning
    })
  };
}

export function createPasswordResetEmail(input) {
  return createRecoveryEmail({ ...input, type: "PASSWORD" });
}

export function createTwoFactorResetEmail(input) {
  return createRecoveryEmail({ ...input, type: "TWO_FACTOR" });
}
