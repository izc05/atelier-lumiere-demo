import { createHash, randomUUID } from "node:crypto";
import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION_PATTERN = /^[0-9]+[.][0-9]+[.][0-9]+$/;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const DOCUMENT_TYPES = new Set([
  "LEGAL_NOTICE",
  "PRIVACY_POLICY",
  "COOKIE_POLICY",
  "PURCHASE_TERMS",
  "SHIPPING_RETURNS",
  "CUSTOM_PRODUCTS",
  "PROVIDER_AGREEMENT",
  "CONTENT_LICENSE"
]);

function adminContext(context) {
  if (!context || context.role !== "ADMIN" || !UUID_PATTERN.test(context.userId ?? "")) {
    throw new ServiceError("UNAUTHORIZED", "Necesitas una sesión administrativa.", 401);
  }
  return { role: "ADMIN", userId: context.userId.toLowerCase(), providerId: null };
}

function uuid(value, field = "id") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function documentType(value) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!DOCUMENT_TYPES.has(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", "El tipo de documento no es válido.", 422, {
      field: "documentType"
    });
  }
  return normalized;
}

function locale(value = "es-ES") {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!LOCALE_PATTERN.test(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", "El idioma del documento no es válido.", 422, {
      field: "locale"
    });
  }
  return normalized;
}

function version(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!VERSION_PATTERN.test(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", "La versión debe tener formato 1.0.0.", 422, {
      field: "version"
    });
  }
  return normalized;
}

function text(value, field, minimum, maximum) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, {
      field,
      minimum,
      maximum
    });
  }
  return normalized;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function serialize(row, { includeContent = false } = {}) {
  return {
    id: row.id,
    documentType: row.document_type,
    locale: row.locale,
    version: row.version,
    title: row.title,
    ...(includeContent ? { contentMarkdown: row.content_markdown } : {}),
    contentSha256: row.content_sha256,
    status: row.status,
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    effectiveAt: row.effective_at,
    publishedAt: row.published_at,
    retiredAt: row.retired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function notFound() {
  return new ServiceError("LEGAL_DOCUMENT_NOT_FOUND", "No se ha encontrado el documento legal.", 404);
}

export function createLegalDocumentsService({
  database,
  environment = process.env.NODE_ENV ?? "development",
  allowTechnicalDrafts = process.env.ALLOW_TECHNICAL_LEGAL_DRAFTS === "true"
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createLegalDocumentsService necesita una base de datos.");
  }

  const technicalActivationAllowed = environment !== "production" && Boolean(allowTechnicalDrafts);

  return Object.freeze({
    async listAdmin(rawContext, { type, status, selectedLocale } = {}) {
      const context = adminContext(rawContext);
      const typeFilter = type ? documentType(type) : null;
      const statusFilter = status && status !== "ALL" ? String(status).toUpperCase() : null;
      if (statusFilter && !["DRAFT", "ACTIVE", "RETIRED"].includes(statusFilter)) {
        throw new ServiceError("VALIDATION_ERROR", "El estado no es válido.", 422);
      }
      const localeFilter = selectedLocale ? locale(selectedLocale) : null;
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT * FROM legal_documents
           WHERE ($1::text IS NULL OR document_type = $1)
             AND ($2::text IS NULL OR status = $2)
             AND ($3::text IS NULL OR locale = $3)
           ORDER BY document_type, locale, created_at DESC`,
          [typeFilter, statusFilter, localeFilter]
        );
        return result.rows.map((row) => serialize(row));
      });
    },

    async getAdmin(rawContext, rawDocumentId) {
      const context = adminContext(rawContext);
      const documentId = uuid(rawDocumentId, "documentId");
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          "SELECT * FROM legal_documents WHERE id = $1",
          [documentId]
        );
        if (result.rowCount !== 1) throw notFound();
        return serialize(result.rows[0], { includeContent: true });
      });
    },

    async create(rawContext, input = {}) {
      const context = adminContext(rawContext);
      const selectedType = documentType(input.documentType);
      const selectedLocale = locale(input.locale);
      const selectedVersion = version(input.version);
      const title = text(input.title, "title", 3, 180);
      const content = text(input.contentMarkdown, "contentMarkdown", 20, 100000);
      const id = randomUUID();
      try {
        return await database.withContext(context, async (transaction) => {
          const result = await transaction.query(
            `INSERT INTO legal_documents (
               id, document_type, locale, version, title,
               content_markdown, content_sha256, created_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING *`,
            [id, selectedType, selectedLocale, selectedVersion, title, content, sha256(content), context.userId]
          );
          return serialize(result.rows[0], { includeContent: true });
        });
      } catch (error) {
        if (error?.code === "23505") {
          throw new ServiceError(
            "LEGAL_DOCUMENT_VERSION_EXISTS",
            "Ya existe esa versión para el documento y el idioma seleccionados.",
            409
          );
        }
        throw error;
      }
    },

    async updateDraft(rawContext, rawDocumentId, input = {}) {
      const context = adminContext(rawContext);
      const documentId = uuid(rawDocumentId, "documentId");
      const title = text(input.title, "title", 3, 180);
      const content = text(input.contentMarkdown, "contentMarkdown", 20, 100000);
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE legal_documents
           SET title = $2, content_markdown = $3, content_sha256 = $4
           WHERE id = $1 AND status = 'DRAFT'
           RETURNING *`,
          [documentId, title, content, sha256(content)]
        );
        if (result.rowCount !== 1) {
          const exists = await transaction.query("SELECT status FROM legal_documents WHERE id = $1", [documentId]);
          if (exists.rowCount !== 1) throw notFound();
          throw new ServiceError(
            "LEGAL_DOCUMENT_NOT_EDITABLE",
            "Una versión activa o retirada no se puede modificar; crea una versión nueva.",
            409
          );
        }
        return serialize(result.rows[0], { includeContent: true });
      });
    },

    async markProfessionallyReviewed(rawContext, rawDocumentId, input = {}) {
      const context = adminContext(rawContext);
      const documentId = uuid(rawDocumentId, "documentId");
      const reviewer = text(input.reviewedBy, "reviewedBy", 3, 180);
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE legal_documents
           SET review_status = 'PROFESSIONAL_REVIEWED',
               reviewed_by = $2,
               reviewed_at = now()
           WHERE id = $1 AND status = 'DRAFT'
             AND review_status = 'TECHNICAL_DRAFT'
           RETURNING *`,
          [documentId, reviewer]
        );
        if (result.rowCount !== 1) {
          const exists = await transaction.query("SELECT id FROM legal_documents WHERE id = $1", [documentId]);
          if (exists.rowCount !== 1) throw notFound();
          throw new ServiceError(
            "LEGAL_DOCUMENT_REVIEW_NOT_ALLOWED",
            "La revisión solo puede registrarse una vez sobre un borrador.",
            409
          );
        }
        return serialize(result.rows[0], { includeContent: true });
      });
    },

    async activate(rawContext, rawDocumentId) {
      const context = adminContext(rawContext);
      const documentId = uuid(rawDocumentId, "documentId");
      return database.withContext(context, async (transaction) => {
        const selected = await transaction.query(
          "SELECT * FROM legal_documents WHERE id = $1 FOR UPDATE",
          [documentId]
        );
        if (selected.rowCount !== 1) throw notFound();
        const document = selected.rows[0];
        if (document.status !== "DRAFT") {
          throw new ServiceError("LEGAL_DOCUMENT_NOT_ACTIVATABLE", "Solo se puede activar un borrador.", 409);
        }
        if (document.review_status !== "PROFESSIONAL_REVIEWED" && !technicalActivationAllowed) {
          throw new ServiceError(
            "LEGAL_DOCUMENT_PROFESSIONAL_REVIEW_REQUIRED",
            "La versión necesita revisión profesional antes de activarse.",
            409
          );
        }
        await transaction.query(
          `UPDATE legal_documents
           SET status = 'RETIRED'
           WHERE document_type = $1 AND locale = $2 AND status = 'ACTIVE'`,
          [document.document_type, document.locale]
        );
        const activated = await transaction.query(
          `UPDATE legal_documents
           SET status = 'ACTIVE'
           WHERE id = $1
           RETURNING *`,
          [documentId]
        );
        return serialize(activated.rows[0], { includeContent: true });
      });
    },

    async retire(rawContext, rawDocumentId) {
      const context = adminContext(rawContext);
      const documentId = uuid(rawDocumentId, "documentId");
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE legal_documents
           SET status = 'RETIRED'
           WHERE id = $1 AND status IN ('DRAFT', 'ACTIVE')
           RETURNING *`,
          [documentId]
        );
        if (result.rowCount !== 1) {
          const exists = await transaction.query("SELECT id FROM legal_documents WHERE id = $1", [documentId]);
          if (exists.rowCount !== 1) throw notFound();
          throw new ServiceError("LEGAL_DOCUMENT_ALREADY_RETIRED", "La versión ya está retirada.", 409);
        }
        return serialize(result.rows[0], { includeContent: true });
      });
    },

    async listPublic(selectedLocale = "es-ES") {
      const requestedLocale = locale(selectedLocale);
      const publicContext = { role: "ADMIN", userId: "00000000-0000-4000-8000-000000000001", providerId: null };
      return database.withContext(publicContext, async (transaction) => {
        const result = await transaction.query(
          `SELECT * FROM legal_documents
           WHERE locale = $1 AND status = 'ACTIVE'
             AND ($2::boolean OR review_status = 'PROFESSIONAL_REVIEWED')
           ORDER BY document_type`,
          [requestedLocale, technicalActivationAllowed]
        );
        return result.rows.map((row) => serialize(row));
      });
    },

    async getPublic(rawType, selectedLocale = "es-ES") {
      const selectedType = documentType(rawType);
      const requestedLocale = locale(selectedLocale);
      const publicContext = { role: "ADMIN", userId: "00000000-0000-4000-8000-000000000001", providerId: null };
      return database.withContext(publicContext, async (transaction) => {
        const result = await transaction.query(
          `SELECT * FROM legal_documents
           WHERE document_type = $1 AND locale = $2 AND status = 'ACTIVE'
             AND ($3::boolean OR review_status = 'PROFESSIONAL_REVIEWED')`,
          [selectedType, requestedLocale, technicalActivationAllowed]
        );
        if (result.rowCount !== 1) throw notFound();
        return serialize(result.rows[0], { includeContent: true });
      });
    }
  });
}
