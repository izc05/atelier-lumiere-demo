function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shell(title, intro, details = "") {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f7f0e7;color:#291b1e;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:36px 24px"><div style="background:#fffdf9;border:1px solid #e8d7c4;border-radius:18px;padding:32px"><p style="margin:0 0 10px;color:#7b2638;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Atelier Lumière</p><h1 style="margin:0 0 20px;font-family:Georgia,serif;font-weight:400">${escapeHtml(title)}</h1><p style="line-height:1.7">${escapeHtml(intro)}</p>${details}</div></div></body></html>`;
}

export function createWorkshopApplicationAdminEmail({ application }) {
  const details = `<dl style="line-height:1.7"><dt><strong>Taller</strong></dt><dd>${escapeHtml(application.displayName)}</dd><dt><strong>Contacto</strong></dt><dd>${escapeHtml(application.contactName)} · ${escapeHtml(application.contactEmail)}</dd><dt><strong>Especialidad</strong></dt><dd>${escapeHtml(application.specialty)}</dd></dl><p>Entra en Administración → Proveedores para aprobarla o rechazarla.</p>`;
  return {
    subject: `Nueva solicitud de taller · ${application.displayName}`,
    text: `Nueva solicitud de taller\n\nTaller: ${application.displayName}\nContacto: ${application.contactName} · ${application.contactEmail}\nEspecialidad: ${application.specialty}\n\nRevísala en Administración → Proveedores.`,
    html: shell("Nueva solicitud de taller", "Hay una solicitud nueva esperando revisión.", details)
  };
}

export function createWorkshopApplicationConfirmationEmail({ application }) {
  return {
    subject: "Hemos recibido tu solicitud · Atelier Lumière",
    text: `Hola ${application.contactName},\n\nHemos recibido la solicitud de ${application.displayName}. La revisaremos personalmente y te responderemos por correo.\n\nReferencia: ${application.id}`,
    html: shell(
      "Solicitud recibida",
      `Hola ${application.contactName}. Hemos recibido la solicitud de ${application.displayName}. La revisaremos personalmente y te responderemos por correo.`,
      `<p style="color:#74666a">Referencia: ${escapeHtml(application.id)}</p>`
    )
  };
}

export function createWorkshopApplicationRejectedEmail({ application }) {
  const note = application.reviewNote ? `\n\nNota de Atelier Lumière: ${application.reviewNote}` : "";
  return {
    subject: "Respuesta a tu solicitud · Atelier Lumière",
    text: `Hola ${application.contactName},\n\nGracias por querer formar parte de Atelier Lumière. En este momento no podemos incorporar la solicitud de ${application.displayName}.${note}`,
    html: shell(
      "Respuesta a tu solicitud",
      `Hola ${application.contactName}. Gracias por querer formar parte de Atelier Lumière. En este momento no podemos incorporar la solicitud de ${application.displayName}.`,
      application.reviewNote ? `<p><strong>Nota:</strong> ${escapeHtml(application.reviewNote)}</p>` : ""
    )
  };
}
