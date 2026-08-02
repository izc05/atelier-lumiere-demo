function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requiredText(value, field, maximum = 500) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximum) throw new TypeError(`${field} no es válido.`);
  return text;
}

function accessUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new TypeError("El enlace de acceso no es válido."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new TypeError("El enlace de acceso no es válido.");
  }
  return url.toString();
}

export function createCustomerOrderAccessEmail({
  displayName,
  accessLink,
  expiresAt,
  orderNumbers = []
} = {}) {
  const name = requiredText(displayName, "displayName", 160);
  const link = accessUrl(accessLink);
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) throw new TypeError("expiresAt no es válido.");
  const orders = Array.isArray(orderNumbers)
    ? orderNumbers.map((value) => requiredText(value, "orderNumber", 80)).slice(0, 20)
    : [];
  const expiryLabel = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid"
  }).format(expiry);
  const orderLabel = orders.length
    ? `Pedidos: ${orders.join(", ")}.`
    : "Tu solicitud de compra se ha registrado.";

  return {
    subject: "Acceso privado a tus pedidos · Atelier Lumière",
    text: [
      `Hola ${name},`,
      "",
      orderLabel,
      "Abre este enlace privado de un solo uso para consultar cada pedido, hablar con los talleres y aprobar presupuestos:",
      link,
      "",
      `El enlace caduca el ${expiryLabel}.`,
      "No reenvíes este enlace. Atelier Lumière nunca te pedirá datos de tarjeta por correo."
    ].join("\n"),
    html: `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f6efe5;color:#2d1d21;font-family:Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf9;border-radius:20px;overflow:hidden;border:1px solid #eadbd4">
      <tr><td style="padding:28px 32px;background:#5a0f1f;color:#fff"><strong style="font-family:Georgia,serif;font-size:24px;font-weight:normal">Atelier Lumière</strong><br><span style="font-size:12px;letter-spacing:.08em">ARTESANÍA PARA CELEBRAR</span></td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:30px;font-weight:normal">Tus pedidos ya están registrados</h1>
        <p>Hola ${escapeHtml(name)},</p>
        <p>${escapeHtml(orderLabel)}</p>
        <p>Utiliza el siguiente acceso privado de un solo uso para consultar cada taller, conversar y aprobar presupuestos.</p>
        <p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#5a0f1f;color:#fff;text-decoration:none;font-weight:bold">Abrir mis pedidos</a></p>
        <p style="font-size:13px;color:#76686c">El enlace caduca el ${escapeHtml(expiryLabel)}. No lo reenvíes. Atelier Lumière nunca solicita datos de tarjeta por correo.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
  };
}
