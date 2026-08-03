const EVENT_COPY = Object.freeze({
  ORDER_CREATED: {
    subject: "Pedido recibido",
    title: "Tu pedido está registrado",
    customer: "Hemos registrado tu compra y el taller ya puede revisarla.",
    provider: "Tienes un pedido nuevo pendiente de revisión."
  },
  ORDER_STATUS_ACCEPTED: {
    subject: "Pedido aceptado",
    title: "El taller ha aceptado el pedido",
    customer: "El taller ha confirmado que puede preparar tu pedido."
  },
  ORDER_STATUS_IN_PRODUCTION: {
    subject: "Pedido en elaboración",
    title: "Tu pieza ya está en elaboración",
    customer: "El taller ha comenzado a preparar tu pedido."
  },
  ORDER_STATUS_READY_TO_SHIP: {
    subject: "Pedido listo para enviar",
    title: "Tu pedido está listo para salir",
    customer: "El taller ha terminado la preparación y está organizando el envío."
  },
  ORDER_STATUS_SHIPPED: {
    subject: "Pedido enviado",
    title: "Tu pedido ya está en camino",
    customer: "El taller ha marcado el pedido como enviado. Consulta el seguimiento en tu área privada."
  },
  ORDER_STATUS_DELIVERED: {
    subject: "Pedido entregado",
    title: "El pedido figura como entregado",
    customer: "El taller ha actualizado el pedido como entregado."
  },
  ORDER_STATUS_INCIDENT: {
    subject: "Pedido con incidencia",
    title: "Hay una actualización importante",
    customer: "El pedido necesita atención. Consulta la incidencia dentro de tu área privada."
  },
  ORDER_STATUS_CANCELLED: {
    subject: "Pedido cancelado",
    title: "El pedido se ha cancelado",
    customer: "El estado del pedido se ha actualizado a cancelado.",
    provider: "El cliente ha cancelado un pedido que todavía estaba pendiente de confirmación."
  },
  PROVIDER_NOTE: {
    subject: "Mensaje del taller",
    title: "El taller ha actualizado tu pedido",
    customer: "Hay una nueva nota del taller. Ábrela desde el seguimiento privado."
  },
  CUSTOM_REQUEST_STATUS_NEEDS_INFO: {
    subject: "Falta información para tu encargo",
    title: "El taller necesita una respuesta",
    customer: "Revisa la conversación del encargo y completa los datos solicitados."
  },
  CUSTOM_REQUEST_STATUS_QUOTED: {
    subject: "Presupuesto disponible",
    title: "El taller ha preparado un presupuesto",
    customer: "Tienes un presupuesto pendiente de revisión y aprobación."
  },
  CUSTOM_REQUEST_STATUS_APPROVED: {
    subject: "Presupuesto aprobado",
    title: "El cliente ha aprobado el presupuesto",
    provider: "El presupuesto del encargo ya está aprobado y puede continuar su elaboración."
  },
  CUSTOM_REQUEST_STATUS_IN_PROGRESS: {
    subject: "Encargo en elaboración",
    title: "El encargo personalizado está en marcha",
    customer: "El taller ha iniciado la elaboración del encargo."
  },
  CUSTOM_REQUEST_STATUS_COMPLETED: {
    subject: "Encargo completado",
    title: "El encargo personalizado está completado",
    customer: "El taller ha terminado el trabajo asociado al encargo."
  },
  CUSTOM_REQUEST_STATUS_CANCELLED: {
    subject: "Encargo cancelado",
    title: "El encargo se ha cancelado",
    customer: "El estado del encargo personalizado se ha actualizado."
  },
  CUSTOM_REQUEST_MESSAGE: {
    subject: "Nuevo mensaje privado",
    title: "Tienes un mensaje nuevo",
    customer: "El taller ha respondido en la conversación de tu encargo.",
    provider: "El cliente ha enviado un mensaje en un encargo personalizado."
  },
  SHIPMENT_CREATED: {
    subject: "Seguimiento disponible",
    title: "El taller ha preparado el seguimiento",
    customer: "Ya puedes consultar los datos de transporte desde tu pedido."
  },
  SHIPMENT_UPDATED: {
    subject: "Seguimiento actualizado",
    title: "Hay novedades en el envío",
    customer: "Los datos de seguimiento del pedido se han actualizado."
  },
  SHIPMENT_STATUS_LABEL_CREATED: {
    subject: "Etiqueta de envío creada",
    title: "El envío está preparado",
    customer: "El transportista ya dispone de la información inicial del envío."
  },
  SHIPMENT_STATUS_IN_TRANSIT: {
    subject: "Envío en tránsito",
    title: "Tu pedido está en camino",
    customer: "El seguimiento indica que el pedido se encuentra en tránsito."
  },
  SHIPMENT_STATUS_DELIVERED: {
    subject: "Envío entregado",
    title: "El transporte figura como entregado",
    customer: "Consulta el pedido y comunica cualquier problema desde el área privada."
  },
  SHIPMENT_STATUS_EXCEPTION: {
    subject: "Incidencia en el transporte",
    title: "El envío necesita atención",
    customer: "El transportista ha comunicado una excepción. Consulta el seguimiento privado."
  },
  SHIPMENT_STATUS_RETURNED: {
    subject: "Envío devuelto",
    title: "El transporte figura como devuelto",
    customer: "Revisa la información del pedido y las posibles incidencias."
  },
  INCIDENT_OPENED: {
    subject: "Nueva incidencia",
    title: "Se ha abierto una incidencia",
    customer: "El taller ha registrado una incidencia relacionada con el pedido.",
    provider: "El cliente ha comunicado una incidencia que necesita revisión."
  },
  INCIDENT_STATUS_INVESTIGATING: {
    subject: "Incidencia en revisión",
    title: "El taller está revisando la incidencia",
    customer: "La incidencia ha pasado a estado de investigación."
  },
  INCIDENT_STATUS_RESOLVED: {
    subject: "Incidencia resuelta",
    title: "El taller ha informado de una resolución",
    customer: "Consulta la respuesta completa dentro del pedido."
  },
  INCIDENT_STATUS_CLOSED: {
    subject: "Incidencia cerrada",
    title: "La incidencia se ha cerrado",
    customer: "La incidencia asociada al pedido figura como cerrada."
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requiredText(value, field, maximum = 500) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean || clean.length > maximum) throw new TypeError(`${field} no es válido.`);
  return clean;
}

function safeUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new TypeError("actionUrl no es válida."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new TypeError("actionUrl no es válida.");
  }
  return url.toString();
}

export function createOrderNotificationEmail({
  recipientName,
  recipientKind,
  providerName,
  orderNumber,
  eventType,
  actionUrl
} = {}) {
  const name = requiredText(recipientName, "recipientName", 160);
  const provider = requiredText(providerName, "providerName", 180);
  const order = requiredText(orderNumber, "orderNumber", 80);
  const kind = recipientKind === "PROVIDER" ? "PROVIDER" : "CUSTOMER";
  const copy = EVENT_COPY[eventType] ?? {
    subject: "Actualización de pedido",
    title: "Hay novedades en un pedido",
    customer: "Consulta la actualización dentro de tu área privada.",
    provider: "Consulta la actualización dentro del panel del taller."
  };
  const detail = copy[kind.toLowerCase()] ?? copy.customer ?? copy.provider;
  const link = safeUrl(actionUrl);
  const subject = `${copy.subject} · ${order}`;

  return {
    subject,
    text: [
      `Hola ${name},`,
      "",
      copy.title,
      detail,
      `Pedido: ${order}`,
      `Taller: ${provider}`,
      "",
      `Abrir seguimiento privado: ${link}`,
      "",
      "Por seguridad, el correo no incluye conversaciones, direcciones ni archivos. Atelier Lumière nunca solicita datos de tarjeta por email."
    ].join("\n"),
    html: `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f6efe5;color:#2d1d21;font-family:Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf9;border-radius:20px;overflow:hidden;border:1px solid #eadbd4">
      <tr><td style="padding:28px 32px;background:#5a0f1f;color:#fff"><strong style="font-family:Georgia,serif;font-size:24px;font-weight:normal">Atelier Lumière</strong><br><span style="font-size:12px;letter-spacing:.08em">ARTESANÍA PARA CELEBRAR</span></td></tr>
      <tr><td style="padding:32px">
        <p style="margin:0 0 8px;color:#8b5b1d;font-size:12px;font-weight:bold;letter-spacing:.08em">${escapeHtml(order)} · ${escapeHtml(provider)}</p>
        <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:30px;font-weight:normal">${escapeHtml(copy.title)}</h1>
        <p>Hola ${escapeHtml(name)},</p>
        <p style="line-height:1.6">${escapeHtml(detail)}</p>
        <p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#5a0f1f;color:#fff;text-decoration:none;font-weight:bold">Abrir seguimiento privado</a></p>
        <p style="font-size:13px;line-height:1.55;color:#76686c">Por seguridad, este correo no incluye conversaciones, direcciones ni archivos. Atelier Lumière nunca solicita datos de tarjeta por email.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
  };
}
