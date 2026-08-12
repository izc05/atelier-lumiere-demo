import { ServiceError } from "./providers-service.mjs";

const STATUSES = new Set(["PENDING", "CHANGES_REQUESTED", "APPROVED", "REJECTED"]);
const SUBMISSION_VERSION = 2;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PHONE_PATTERN = /^[0-9+() ./xX-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(value, field, min, max) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < min || normalized.length > max) {
    throw new ServiceError("VALIDATION_ERROR", `${field} debe tener entre ${min} y ${max} caracteres.`, 422, { field });
  }
  return normalized;
}

function optionalText(value, field, min, max) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return requiredText(value, field, min, max);
}

function email(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", "contactEmail no es válido.", 422, { field: "contactEmail" });
  }
  return normalized;
}

function website(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const normalized = String(value).trim();
  if (normalized.length > 500) {
    throw new ServiceError("VALIDATION_ERROR", "websiteUrl es demasiado largo.", 422, { field: "websiteUrl" });
  }
  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw new ServiceError("VALIDATION_ERROR", "websiteUrl debe ser una dirección web válida.", 422, { field: "websiteUrl" });
  }
}

function phone(value) {
  const normalized = optionalText(value, "phone", 7, 40);
  if (normalized !== null && (!PHONE_PATTERN.test(normalized) || !/[0-9]/.test(normalized))) {
    throw new ServiceError("VALIDATION_ERROR", "phone no tiene un formato válido.", 422, { field: "phone" });
  }
  return normalized;
}

function proposedSlug(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized.length < 2 || normalized.length > 80 || !SLUG_PATTERN.test(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", "proposedSlug no tiene un formato válido.", 422, {
      field: "proposedSlug"
    });
  }
  return normalized;
}

function socialNetworks(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ServiceError("VALIDATION_ERROR", "socialNetworks debe ser un objeto.", 422, {
      field: "socialNetworks"
    });
  }
  return value;
}

function uuid(value, field = "applicationId") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function serialize(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    legalName: row.legal_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    specialty: row.specialty,
    websiteUrl: row.website_url,
    message: row.message,
    phone: row.phone,
    proposedSlug: row.proposed_slug,
    workDescription: row.work_description,
    applicantStory: row.applicant_story,
    socialNetworks: row.social_networks,
    adminNotes: row.admin_notes,
    privacyAcceptedAt: row.privacy_accepted_at,
    privacyDocumentVersion: row.privacy_document_version,
    submissionVersion: row.submission_version,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    providerId: row.provider_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createWorkshopApplicationsService({
  database,
  systemContext,
  providersService,
  mailService,
  notificationEmail = process.env.WORKSHOP_APPLICATION_NOTIFICATION_EMAIL,
  privacyDocumentVersion = process.env.WORKSHOP_PRIVACY_DOCUMENT_VERSION ?? "0.1.0",
  logger = console
} = {}) {
  if (!database || typeof database.withContext !== "function") throw new TypeError("Falta la base de datos de solicitudes.");
  if (!systemContext) throw new TypeError("Falta el contexto de solicitudes.");
  if (typeof privacyDocumentVersion !== "string" || privacyDocumentVersion.trim().length < 1
      || privacyDocumentVersion.trim().length > 80) {
    throw new TypeError("La versión de privacidad de solicitudes no es válida.");
  }
  const currentPrivacyDocumentVersion = privacyDocumentVersion.trim();

  async function safelyNotify(operation, kind, applicationId) {
    if (!mailService?.enabled || typeof operation !== "function") return { status: "DISABLED" };
    try {
      return await operation();
    } catch (error) {
      logger.error("No se pudo enviar un aviso de solicitud de taller.", { kind, applicationId, error });
      return { status: "FAILED" };
    }
  }

  return Object.freeze({
    async submit(input) {
      if (input?.companyWebsite) {
        throw new ServiceError("INVALID_SUBMISSION", "No se pudo enviar la solicitud.", 422);
      }
      if (input?.privacyAccepted !== true) {
        throw new ServiceError(
          "PRIVACY_CONSENT_REQUIRED",
          "Debes aceptar la política de privacidad para enviar la solicitud.",
          422,
          { field: "privacyAccepted" }
        );
      }
      const values = {
        displayName: requiredText(input?.displayName, "displayName", 2, 140),
        legalName: optionalText(input?.legalName, "legalName", 2, 180),
        contactName: requiredText(input?.contactName, "contactName", 2, 120),
        contactEmail: email(input?.contactEmail),
        specialty: requiredText(input?.specialty, "specialty", 2, 160),
        websiteUrl: website(input?.websiteUrl),
        message: optionalText(input?.message, "message", 10, 2000),
        phone: phone(input?.phone),
        proposedSlug: proposedSlug(input?.proposedSlug),
        workDescription: optionalText(input?.workDescription, "workDescription", 20, 4000),
        applicantStory: optionalText(input?.applicantStory, "applicantStory", 20, 4000),
        socialNetworks: socialNetworks(input?.socialNetworks)
      };

      let application;
      try {
        application = await database.withContext(systemContext, async (transaction) => {
          const result = await transaction.query(
            `INSERT INTO workshop_applications
              (display_name, legal_name, contact_name, contact_email, specialty, website_url, message,
               phone, proposed_slug, work_description, applicant_story, social_networks,
               privacy_accepted_at, privacy_document_version, submission_version)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
               now(), $13, $14)
             RETURNING *`,
            [values.displayName, values.legalName, values.contactName, values.contactEmail,
              values.specialty, values.websiteUrl, values.message, values.phone, values.proposedSlug,
              values.workDescription, values.applicantStory, JSON.stringify(values.socialNetworks),
              currentPrivacyDocumentVersion, SUBMISSION_VERSION]
          );
          return serialize(result.rows[0]);
        });
      } catch (error) {
        if (error?.constraint === "workshop_applications_proposed_slug_provider_conflict") {
          throw new ServiceError(
            "PROPOSED_SLUG_UNAVAILABLE",
            "El identificador propuesto ya pertenece a un taller.",
            409,
            { field: "proposedSlug" }
          );
        }
        if (error?.code === "23505") {
          throw new ServiceError(
            "APPLICATION_ALREADY_PENDING",
            "Ya existe una solicitud pendiente para este correo. Te responderemos en cuanto la revisemos.",
            409,
            { field: "contactEmail" }
          );
        }
        throw error;
      }

      await Promise.all([
        notificationEmail
          ? safelyNotify(
              () => mailService.sendWorkshopApplicationAdmin({ to: notificationEmail, application }),
              "ADMIN_NEW_APPLICATION",
              application.id
            )
          : Promise.resolve({ status: "DISABLED" }),
        safelyNotify(
          () => mailService.sendWorkshopApplicationConfirmation({ to: application.contactEmail, application }),
          "APPLICANT_CONFIRMATION",
          application.id
        )
      ]);
      return application;
    },

    async list(context, statusValue = "PENDING") {
      if (context?.role !== "ADMIN") throw new ServiceError("FORBIDDEN", "Solo administración puede revisar solicitudes.", 403);
      const status = String(statusValue ?? "PENDING").toUpperCase();
      if (status !== "ALL" && !STATUSES.has(status)) {
        throw new ServiceError("VALIDATION_ERROR", "El estado de solicitud no es válido.", 422);
      }
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT * FROM workshop_applications
           WHERE ($1::text = 'ALL' OR status = $1)
           ORDER BY created_at DESC`,
          [status]
        );
        return result.rows.map(serialize);
      });
    },

    async approve(context, applicationIdValue, input = {}) {
      if (context?.role !== "ADMIN") throw new ServiceError("FORBIDDEN", "Solo administración puede aprobar solicitudes.", 403);
      if (!providersService) throw new ServiceError("SERVICE_UNAVAILABLE", "No se pueden crear talleres ahora mismo.", 503);
      const applicationId = uuid(applicationIdValue);
      const reviewNote = optionalText(input.reviewNote, "reviewNote", 2, 1000);
      const application = await database.withContext(context, async (transaction) => {
        const result = await transaction.query("SELECT * FROM workshop_applications WHERE id = $1", [applicationId]);
        if (result.rowCount !== 1) throw new ServiceError("APPLICATION_NOT_FOUND", "No se ha encontrado la solicitud.", 404);
        if (result.rows[0].status !== "PENDING") throw new ServiceError("APPLICATION_ALREADY_REVIEWED", "Esta solicitud ya se ha revisado.", 409);
        return serialize(result.rows[0]);
      });

      const created = await providersService.create(context, {
        displayName: application.displayName,
        legalName: application.legalName,
        contactName: application.contactName,
        contactEmail: application.contactEmail,
        specialty: application.specialty,
        role: "PROVIDER_OWNER"
      });

      const reviewed = await database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE workshop_applications
           SET status = 'APPROVED', review_note = $2, reviewed_by = $3,
               reviewed_at = now(), provider_id = $4
           WHERE id = $1 AND status = 'PENDING'
           RETURNING *`,
          [applicationId, reviewNote, context.userId, created.provider.id]
        );
        if (result.rowCount !== 1) throw new ServiceError("APPLICATION_ALREADY_REVIEWED", "Esta solicitud ya se ha revisado.", 409);
        return serialize(result.rows[0]);
      });
      return { application: reviewed, ...created };
    },

    async reject(context, applicationIdValue, input = {}) {
      if (context?.role !== "ADMIN") throw new ServiceError("FORBIDDEN", "Solo administración puede rechazar solicitudes.", 403);
      const applicationId = uuid(applicationIdValue);
      const reviewNote = optionalText(input.reviewNote, "reviewNote", 2, 1000);
      const application = await database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE workshop_applications
           SET status = 'REJECTED', review_note = $2, reviewed_by = $3, reviewed_at = now()
           WHERE id = $1 AND status = 'PENDING'
           RETURNING *`,
          [applicationId, reviewNote, context.userId]
        );
        if (result.rowCount !== 1) throw new ServiceError("APPLICATION_NOT_FOUND", "La solicitud no existe o ya se ha revisado.", 404);
        return serialize(result.rows[0]);
      });
      await safelyNotify(
        () => mailService.sendWorkshopApplicationRejected({ to: application.contactEmail, application }),
        "APPLICATION_REJECTED",
        application.id
      );
      return application;
    }
  });
}
