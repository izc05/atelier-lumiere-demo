const BRAND = "Atelier Lumière";
const TAGLINE = "Artesanía para celebrar";

function requiredText(value, field, max = 300) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) {
    throw new TypeError(`${field} no es válido.`);
  }
  return normalized;
}

function safeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("El enlace del correo no es válido.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new TypeError("El enlace del correo no es seguro.");
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
  if (Number.isNaN(date.getTime())) throw new TypeError("La caducidad del correo no es válida.");
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Madrid"
  }).format(date);
}

function layout({ preview, heading, greeting, paragraphs, actionLabel, actionUrl, expiry, footer }) {
  const safePreview = escapeHtml(preview);
  const safeHeading = escapeHtml(heading);
  const safeGreeting = escapeHtml(greeting);
  const safeActionLabel = escapeHtml(actionLabel);
  const safeActionUrl = escapeHtml(actionUrl);
  const safeExpiry = escapeHtml(expiry);
  const paragraphHtml = paragraphs
    .map((paragraph) => `<p style="margin:0 0 18px;color:#493a3e;font-size:16px;line-height:1.7">${escapeHtml(paragraph)}</p>`)
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeHeading}</title>
</head>
<body style="margin:0;background:#f6eee3;color:#291b1e;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${safePreview}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6eee3;padding:32px 14px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf9;border:1px solid #eadbca;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(59,9,20,.08)">
          <tr>
            <td style="padding:28px 34px;background:#5a0f1f;color:#fffaf4">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.1">${BRAND}</div>
              <div style="margin-top:7px;color:#e7d3a2;font-size:12px;letter-spacing:.12em;text-transform:uppercase">${TAGLINE}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:38px 34px 34px">
              <p style="margin:0 0 12px;color:#7b2638;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Acceso seguro de proveedor</p>
              <h1 style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:400;line-height:1.15;color:#3b0914">${safeHeading}</h1>
              <p style="margin:0 0 18px;color:#291b1e;font-size:16px;line-height:1.7">${safeGreeting}</p>
              ${paragraphHtml}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0">
                <tr>
                  <td style="border-radius:999px;background:#5a0f1f">
                    <a href="${safeActionUrl}" style="display:inline-block;padding:14px 24px;color:#fffaf4;text-decoration:none;font-size:15px;font-weight:700">${safeActionLabel}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#74666a;font-size:13px;line-height:1.6">Este enlace caduca el ${safeExpiry} y solo puede utilizarse una vez.</p>
              <p style="margin:0;color:#74666a;font-size:13px;line-height:1.6">Si el botón no funciona, copia este enlace en el navegador:</p>
              <p style="margin:8px 0 0;word-break:break-all;color:#5a0f1f;font-size:12px;line-height:1.6">${safeActionUrl}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 34px;border-top:1px solid #eee2d3;background:#fbf7f0;color:#74666a;font-size:12px;line-height:1.6">
              ${escapeHtml(footer)}<br>
              ${BRAND} · ${TAGLINE}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function createInvitationEmail({ contactName, providerName, actionUrl, expiresAt }) {
  const name = requiredText(contactName, "contactName", 120);
  const provider = requiredText(providerName, "providerName", 140);
  const url = safeUrl(actionUrl);
  const expiry = formatExpiry(expiresAt);
  const subject = `Invitación para gestionar ${provider} en ${BRAND}`;
  const paragraphs = [
    `Has recibido una invitación para crear la cuenta responsable de ${provider}.`,
    "Durante la activación crearás una contraseña, verificarás tu correo y configurarás el doble factor de seguridad. El taller no se publicará hasta que Administración lo apruebe."
  ];

  return {
    subject,
    text: [
      `${BRAND} — ${TAGLINE}`,
      "",
      `Hola ${name}:`,
      ...paragraphs,
      "",
      `Activar cuenta: ${url}`,
      `Caduca: ${expiry}`,
      "",
      "No compartas este enlace. Si no esperabas esta invitación, puedes ignorar el mensaje."
    ].join("\n"),
    html: layout({
      preview: `Activa la cuenta de ${provider}.`,
      heading: "Activa tu cuenta de proveedor",
      greeting: `Hola ${name}:`,
      paragraphs,
      actionLabel: "Activar mi cuenta",
      actionUrl: url,
      expiry,
      footer: "No compartas este enlace. Si no esperabas esta invitación, puedes ignorar el mensaje."
    })
  };
}

export function createVerificationEmail({ displayName, providerName, actionUrl, expiresAt }) {
  const name = requiredText(displayName, "displayName", 120);
  const provider = requiredText(providerName, "providerName", 140);
  const url = safeUrl(actionUrl);
  const expiry = formatExpiry(expiresAt);
  const subject = `Verifica tu correo para ${provider}`;
  const paragraphs = [
    `La cuenta de ${provider} ya tiene contraseña. Confirma ahora que este correo te pertenece.`,
    "Después de verificarlo, el sistema te guiará para activar el doble factor con una aplicación autenticadora."
  ];

  return {
    subject,
    text: [
      `${BRAND} — ${TAGLINE}`,
      "",
      `Hola ${name}:`,
      ...paragraphs,
      "",
      `Verificar correo: ${url}`,
      `Caduca: ${expiry}`,
      "",
      "Si no has creado esta cuenta, contacta con Administración y no utilices el enlace."
    ].join("\n"),
    html: layout({
      preview: `Verifica el correo de tu cuenta de ${provider}.`,
      heading: "Verifica tu correo",
      greeting: `Hola ${name}:`,
      paragraphs,
      actionLabel: "Verificar mi correo",
      actionUrl: url,
      expiry,
      footer: "Si no has creado esta cuenta, contacta con Administración y no utilices el enlace."
    })
  };
}
