import { createHash } from "node:crypto";
import { ServiceError } from "./providers-service.mjs";

const DOCUMENT_SLUGS = Object.freeze({
  "aviso-legal": "LEGAL_NOTICE",
  privacidad: "PRIVACY_POLICY",
  cookies: "COOKIE_POLICY",
  "condiciones-compra": "PURCHASE_TERMS",
  "envios-devoluciones": "SHIPPING_RETURNS",
  "productos-personalizados": "PERSONALIZED_PRODUCTS",
  proveedores: "PROVIDER_AGREEMENT",
  "licencias-contenido": "CONTENT_LICENSE"
});
const SLUG_BY_TYPE = Object.freeze(
  Object.fromEntries(Object.entries(DOCUMENT_SLUGS).map(([slug, type]) => [type, slug]))
);
const PRIVACY_KEY_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;

function legalContext(context) {
  if (
    !context
    || !["LEGAL_SERVICE", "ADMIN"].includes(context.role)
    || typeof context.userId !== "string"
  ) {
    throw new TypeError("createLegalService necesita un contexto técnico legal.");
  }
  return { role: context.role, userId: context.userId, providerId: null };
}

function hashKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeKey(value, { optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional) return null;
  if (typeof value !== "string" || !PRIVACY_KEY_PATTERN.test(value)) {
    throw new ServiceError("PRIVACY_KEY_INVALID", "La clave de preferencias no es válida.", 400);
  }
  return value;
}

function boolean(value) {
  return value === true;
}

function serializeDocument(row) {
  return {
    id: row.id,
    slug: SLUG_BY_TYPE[row.document_type],
    type: row.document_type,
    version: row.version,
    title: row.title,
    summary: row.summary,
    contentMd: row.content_md,
    contentSha256: row.content_sha256,
    status: row.status,
    professionalReviewRequired: row.professional_review_required,
    effectiveAt: row.effective_at,
    updatedAt: row.updated_at
  };
}

function serializePreferences(row, keyExists) {
  return {
    keyExists,
    necessary: true,
    preferences: Boolean(row?.preferences),
    analytics: Boolean(row?.analytics),
    marketing: Boolean(row?.marketing),
    version: row?.version ?? 0,
    updatedAt: row?.updated_at ?? null,
    optionalServicesConfigured: false
  };
}

export function createLegalService({
  database,
  systemContext,
  environment = process.env.NODE_ENV ?? "development"
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createLegalService necesita una base de datos.");
  }
  const context = legalContext(systemContext);
  const production = environment === "production";

  async function selectedDocuments(transaction, type = null) {
    const result = await transaction.query(
      `SELECT *
       FROM legal_documents
       WHERE ($1::text IS NULL OR document_type = $1)
         AND (
           status = 'PUBLISHED'
           OR ($2::boolean = false AND status = 'DRAFT')
         )
       ORDER BY document_type,
         CASE status WHEN 'PUBLISHED' THEN 0 ELSE 1 END,
         updated_at DESC`,
      [type, production]
    );
    const selected = new Map();
    for (const row of result.rows) {
      if (!selected.has(row.document_type)) selected.set(row.document_type, row);
    }
    return [...selected.values()];
  }

  async function cookieDocument(transaction) {
    const documents = await selectedDocuments(transaction, "COOKIE_POLICY");
    if (documents.length !== 1) {
      throw new ServiceError(
        "COOKIE_POLICY_UNAVAILABLE",
        "La política de cookies todavía no está disponible.",
        503
      );
    }
    return documents[0];
  }

  return Object.freeze({
    async listDocuments() {
      return database.withContext(context, async (transaction) => {
        const rows = await selectedDocuments(transaction);
        return rows.map(serializeDocument);
      });
    },

    async getDocument(rawSlug) {
      const slug = typeof rawSlug === "string" ? rawSlug.trim().toLowerCase() : "";
      const type = DOCUMENT_SLUGS[slug];
      if (!type) {
        throw new ServiceError("LEGAL_DOCUMENT_NOT_FOUND", "No se ha encontrado el documento.", 404);
      }
      return database.withContext(context, async (transaction) => {
        const rows = await selectedDocuments(transaction, type);
        if (rows.length !== 1) {
          throw new ServiceError("LEGAL_DOCUMENT_NOT_FOUND", "No se ha encontrado el documento.", 404);
        }
        return serializeDocument(rows[0]);
      });
    },

    async getPreferences(rawKey) {
      const key = normalizeKey(rawKey, { optional: true });
      if (!key) return serializePreferences(null, false);
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT preferences, analytics, marketing, version, updated_at
           FROM privacy_preference_records
           WHERE preference_key_hash = $1`,
          [hashKey(key)]
        );
        return serializePreferences(result.rows[0] ?? null, true);
      });
    },

    async savePreferences(rawKey, input = {}) {
      const key = normalizeKey(rawKey);
      const categories = {
        necessary: true,
        preferences: boolean(input.preferences),
        analytics: boolean(input.analytics),
        marketing: boolean(input.marketing)
      };
      return database.withContext(context, async (transaction) => {
        const document = await cookieDocument(transaction);
        const keyHash = hashKey(key);
        const result = await transaction.query(
          `INSERT INTO privacy_preference_records (
             preference_key_hash, legal_document_id,
             necessary, preferences, analytics, marketing
           ) VALUES ($1, $2, true, $3, $4, $5)
           ON CONFLICT (preference_key_hash) DO UPDATE SET
             legal_document_id = EXCLUDED.legal_document_id,
             preferences = EXCLUDED.preferences,
             analytics = EXCLUDED.analytics,
             marketing = EXCLUDED.marketing
           RETURNING preferences, analytics, marketing, version, updated_at`,
          [
            keyHash,
            document.id,
            categories.preferences,
            categories.analytics,
            categories.marketing
          ]
        );
        const anyOptional = categories.preferences || categories.analytics || categories.marketing;
        await transaction.query(
          `INSERT INTO legal_consent_events (
             preference_key_hash, legal_document_id, event_type,
             decision, categories, evidence
           ) VALUES ($1, $2, 'COOKIE_PREFERENCES_SAVED', $3, $4::jsonb, $5::jsonb)`,
          [
            keyHash,
            document.id,
            anyOptional ? "GRANTED" : "DENIED",
            JSON.stringify(categories),
            JSON.stringify({
              source: "privacy-center",
              optionalServicesConfigured: false,
              documentVersion: document.version
            })
          ]
        );
        return serializePreferences(result.rows[0], true);
      });
    }
  });
}

export const LEGAL_DOCUMENT_SLUGS = Object.freeze(Object.keys(DOCUMENT_SLUGS));
