import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_STATUSES = new Set(["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED"]);

function requiredText(value, field, min, max) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < min || normalized.length > max) {
    throw new ServiceError("VALIDATION_ERROR", `${field} debe tener entre ${min} y ${max} caracteres.`, 422, { field });
  }
  return normalized;
}

function optionalText(value, field, max) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return requiredText(value, field, 2, max);
}

function shortList(value, field) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 12) {
    throw new ServiceError("VALIDATION_ERROR", `${field} debe ser una lista de hasta 12 elementos.`, 422, { field });
  }
  const normalized = [...new Set(value.map((item) => requiredText(item, field, 2, 60)))];
  return normalized;
}

function uuid(value, field = "providerId") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function featuredProductIds(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 4) {
    throw new ServiceError("VALIDATION_ERROR", "featuredProductIds debe contener como máximo cuatro piezas.", 422, {
      field: "featuredProductIds"
    });
  }
  const normalized = value.map((item, index) => uuid(item, `featuredProductIds.${index}`));
  if (new Set(normalized).size !== normalized.length) {
    throw new ServiceError("VALIDATION_ERROR", "Una pieza no puede aparecer dos veces entre los destacados.", 422, {
      field: "featuredProductIds"
    });
  }
  return normalized;
}

function serialize(row) {
  if (!row) return null;
  return {
    providerId: row.provider_id,
    providerSlug: row.provider_slug,
    accountDisplayName: row.account_display_name,
    accountSpecialty: row.account_specialty,
    status: row.status,
    publicName: row.public_name,
    specialtyLabel: row.specialty_label,
    tagline: row.tagline,
    locationLabel: row.location_label,
    story: row.story,
    craftDescription: row.craft_description,
    materials: Array.isArray(row.materials) ? row.materials : [],
    techniques: Array.isArray(row.techniques) ? row.techniques : [],
    preparationNote: row.preparation_note,
    shippingNote: row.shipping_note,
    acceptsCustomRequests: row.accepts_custom_requests,
    featuredProductIds: Array.isArray(row.featured_product_ids) ? row.featured_product_ids : [],
    featuredProductChoices: Array.isArray(row.featured_product_choices) ? row.featured_product_choices : [],
    editorialNote: row.editorial_note,
    version: row.version,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    publication: row.public_revision ? {
      revision: row.public_revision,
      publishedAt: row.public_published_at,
      snapshot: row.public_snapshot
    } : null
  };
}

const SELECT_PROFILE = `
  SELECT profile.*,
         provider.slug::text AS provider_slug,
         provider.display_name AS account_display_name,
         provider.specialty AS account_specialty,
         COALESCE((
           SELECT array_agg(featured.product_id ORDER BY featured.sort_order)
           FROM provider_profile_featured_products featured
           WHERE featured.provider_id = profile.provider_id
         ), ARRAY[]::uuid[]) AS featured_product_ids,
         app.provider_featured_product_choices(profile.provider_id) AS featured_product_choices,
         publication.revision AS public_revision,
         publication.published_at AS public_published_at,
         publication.snapshot AS public_snapshot
    FROM provider_profiles profile
    INNER JOIN providers provider ON provider.id = profile.provider_id
    LEFT JOIN provider_profile_publications publication ON publication.provider_id = profile.provider_id
`;

async function writeAudit(transaction, context, providerId, action, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'provider_profile', $2, $4::jsonb)`,
    [context.userId, providerId, action, JSON.stringify(metadata)]
  );
}

export function createProviderProfileService({ database } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createProviderProfileService necesita una base de datos.");
  }

  async function readForProvider(transaction, providerId) {
    const result = await transaction.query(`${SELECT_PROFILE} WHERE profile.provider_id = $1`, [providerId]);
    if (result.rowCount !== 1) {
      throw new ServiceError("PROVIDER_PROFILE_NOT_FOUND", "No se ha encontrado el perfil del taller.", 404);
    }
    return result.rows[0];
  }

  return Object.freeze({
    async get(context) {
      if (!context?.providerId) {
        throw new ServiceError("FORBIDDEN", "Esta operación requiere un taller activo.", 403);
      }
      return database.withContext(context, async (transaction) => serialize(await readForProvider(transaction, context.providerId)));
    },

    async update(context, input = {}) {
      if (!context?.providerId) {
        throw new ServiceError("FORBIDDEN", "Esta operación requiere un taller activo.", 403);
      }
      const values = {
        publicName: input.publicName === undefined ? undefined : requiredText(input.publicName, "publicName", 2, 140),
        specialtyLabel: input.specialtyLabel === undefined ? undefined : requiredText(input.specialtyLabel, "specialtyLabel", 2, 160),
        tagline: input.tagline === undefined ? undefined : requiredText(input.tagline, "tagline", 0, 180),
        locationLabel: input.locationLabel === undefined ? undefined : optionalText(input.locationLabel, "locationLabel", 120),
        story: input.story === undefined ? undefined : optionalText(input.story, "story", 4000),
        craftDescription: input.craftDescription === undefined ? undefined : optionalText(input.craftDescription, "craftDescription", 2500),
        materials: shortList(input.materials, "materials"),
        techniques: shortList(input.techniques, "techniques"),
        preparationNote: input.preparationNote === undefined ? undefined : optionalText(input.preparationNote, "preparationNote", 1200),
        shippingNote: input.shippingNote === undefined ? undefined : optionalText(input.shippingNote, "shippingNote", 1200),
        acceptsCustomRequests: input.acceptsCustomRequests === undefined ? undefined : Boolean(input.acceptsCustomRequests),
        featuredProductIds: featuredProductIds(input.featuredProductIds)
      };

      return database.withContext(context, async (transaction) => {
        const current = await readForProvider(transaction, context.providerId);
        if (["IN_REVIEW", "APPROVED"].includes(current.status)) {
          throw new ServiceError("PROFILE_LOCKED", "El perfil está bloqueado mientras Atelier Lumière lo revisa.", 409);
        }
        if (current.status === "PUBLISHED") {
          await transaction.query(
            `UPDATE provider_profiles SET status = 'DRAFT' WHERE provider_id = $1`,
            [context.providerId]
          );
        }

        if (values.featuredProductIds !== undefined) {
          const availableIds = new Set(
            (Array.isArray(current.featured_product_choices) ? current.featured_product_choices : [])
              .map((item) => String(item?.id ?? "").toLowerCase())
              .filter((item) => UUID_PATTERN.test(item))
          );
          const unavailable = values.featuredProductIds.filter((productId) => !availableIds.has(productId));
          if (unavailable.length) {
            throw new ServiceError(
              "FEATURED_PRODUCT_NOT_AVAILABLE",
              "Solo puedes destacar piezas de tu taller que tengan una publicación visible.",
              422,
              { field: "featuredProductIds" }
            );
          }

          await transaction.query(
            `DELETE FROM provider_profile_featured_products WHERE provider_id = $1`,
            [context.providerId]
          );
          for (const [sortOrder, productId] of values.featuredProductIds.entries()) {
            await transaction.query(
              `INSERT INTO provider_profile_featured_products (provider_id, product_id, sort_order)
               VALUES ($1, $2, $3)`,
              [context.providerId, productId, sortOrder]
            );
          }
        }

        const result = await transaction.query(
          `UPDATE provider_profiles
              SET public_name = COALESCE($2, public_name),
                  specialty_label = COALESCE($3, specialty_label),
                  tagline = COALESCE($4, tagline),
                  location_label = CASE WHEN $5::boolean THEN $6 ELSE location_label END,
                  story = CASE WHEN $7::boolean THEN $8 ELSE story END,
                  craft_description = CASE WHEN $9::boolean THEN $10 ELSE craft_description END,
                  materials = COALESCE($11::text[], materials),
                  techniques = COALESCE($12::text[], techniques),
                  preparation_note = CASE WHEN $13::boolean THEN $14 ELSE preparation_note END,
                  shipping_note = CASE WHEN $15::boolean THEN $16 ELSE shipping_note END,
                  accepts_custom_requests = COALESCE($17::boolean, accepts_custom_requests)
            WHERE provider_id = $1
        RETURNING *`,
          [
            context.providerId,
            values.publicName ?? null,
            values.specialtyLabel ?? null,
            values.tagline === undefined ? null : values.tagline,
            input.locationLabel !== undefined, values.locationLabel ?? null,
            input.story !== undefined, values.story ?? null,
            input.craftDescription !== undefined, values.craftDescription ?? null,
            values.materials ?? null,
            values.techniques ?? null,
            input.preparationNote !== undefined, values.preparationNote ?? null,
            input.shippingNote !== undefined, values.shippingNote ?? null,
            values.acceptsCustomRequests === undefined ? null : values.acceptsCustomRequests
          ]
        );
        await writeAudit(transaction, context, context.providerId, "PROVIDER_PROFILE_DRAFT_SAVED", {
          version: result.rows[0].version,
          featuredProductCount: values.featuredProductIds?.length ?? current.featured_product_ids?.length ?? 0
        });
        return serialize(await readForProvider(transaction, context.providerId));
      });
    },

    async submit(context) {
      if (!context?.providerId) {
        throw new ServiceError("FORBIDDEN", "Esta operación requiere un taller activo.", 403);
      }
      return database.withContext(context, async (transaction) => {
        const current = await readForProvider(transaction, context.providerId);
        if (!["DRAFT", "CHANGES_REQUESTED"].includes(current.status)) {
          throw new ServiceError("PROFILE_NOT_EDITABLE", "El perfil no se puede enviar a revisión en su estado actual.", 409);
        }
        try {
          await transaction.query(
            `UPDATE provider_profiles SET status = 'IN_REVIEW' WHERE provider_id = $1`,
            [context.providerId]
          );
        } catch (error) {
          if (error?.code === "23514" && String(error.message).includes("PROVIDER_PROFILE_FEATURED_PRODUCT_NOT_VISIBLE")) {
            throw new ServiceError(
              "FEATURED_PRODUCT_NOT_AVAILABLE",
              "Una de las piezas destacadas ya no está publicada. Retírala o elige otra antes de enviar el perfil.",
              422,
              { field: "featuredProductIds" }
            );
          }
          if (error?.code === "23514") {
            throw new ServiceError(
              "PROFILE_NOT_READY_FOR_REVIEW",
              "Completa nombre público, especialidad, presentación, historia, descripción del oficio y portada antes de enviarlo.",
              422
            );
          }
          throw error;
        }
        await writeAudit(transaction, context, context.providerId, "PROVIDER_PROFILE_SUBMITTED");
        return serialize(await readForProvider(transaction, context.providerId));
      });
    },

    async listAdmin(context, { status = "ALL", query = "" } = {}) {
      if (context?.role !== "ADMIN") {
        throw new ServiceError("FORBIDDEN", "La revisión del perfil requiere Administración.", 403);
      }
      const normalizedStatus = String(status || "ALL").toUpperCase();
      if (normalizedStatus !== "ALL" && !PROFILE_STATUSES.has(normalizedStatus)) {
        throw new ServiceError("VALIDATION_ERROR", "El estado del perfil no es válido.", 422);
      }
      const search = typeof query === "string" ? query.trim().slice(0, 120) : "";
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `${SELECT_PROFILE}
            WHERE ($1::text = 'ALL' OR profile.status = $1)
              AND ($2::text = '' OR provider.display_name ILIKE '%' || $2 || '%' OR profile.public_name ILIKE '%' || $2 || '%')
            ORDER BY CASE profile.status
              WHEN 'IN_REVIEW' THEN 0 WHEN 'APPROVED' THEN 1 WHEN 'CHANGES_REQUESTED' THEN 2 WHEN 'DRAFT' THEN 3 ELSE 4 END,
              profile.updated_at DESC`,
          [normalizedStatus, search]
        );
        return result.rows.map(serialize);
      });
    },

    async getAdmin(context, providerIdValue) {
      if (context?.role !== "ADMIN") {
        throw new ServiceError("FORBIDDEN", "La revisión del perfil requiere Administración.", 403);
      }
      const providerId = uuid(providerIdValue);
      return database.withContext(context, async (transaction) => serialize(await readForProvider(transaction, providerId)));
    },

    async decide(context, providerIdValue, input = {}) {
      if (context?.role !== "ADMIN") {
        throw new ServiceError("FORBIDDEN", "La revisión del perfil requiere Administración.", 403);
      }
      const providerId = uuid(providerIdValue);
      const decision = String(input.decision || "").toUpperCase();
      if (!["APPROVE", "REQUEST_CHANGES"].includes(decision)) {
        throw new ServiceError("VALIDATION_ERROR", "La decisión debe ser APPROVE o REQUEST_CHANGES.", 422);
      }
      const note = optionalText(input.note, "note", 1200);
      if (decision === "REQUEST_CHANGES" && !note) {
        throw new ServiceError("VALIDATION_ERROR", "Indica qué debe corregir el taller.", 422, { field: "note" });
      }

      return database.withContext(context, async (transaction) => {
        const current = await readForProvider(transaction, providerId);
        if (current.status !== "IN_REVIEW") {
          throw new ServiceError("PROFILE_NOT_IN_REVIEW", "El perfil no está pendiente de revisión.", 409);
        }
        const nextStatus = decision === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED";
        await transaction.query(
          `UPDATE provider_profiles SET status = $2, editorial_note = $3 WHERE provider_id = $1`,
          [providerId, nextStatus, note]
        );
        await writeAudit(transaction, context, providerId,
          decision === "APPROVE" ? "PROVIDER_PROFILE_APPROVED" : "PROVIDER_PROFILE_CHANGES_REQUESTED",
          { note }
        );
        return serialize(await readForProvider(transaction, providerId));
      });
    },

    async publish(context, providerIdValue) {
      if (context?.role !== "ADMIN") {
        throw new ServiceError("FORBIDDEN", "La publicación del perfil requiere Administración.", 403);
      }
      const providerId = uuid(providerIdValue);
      return database.withContext(context, async (transaction) => {
        const current = await readForProvider(transaction, providerId);
        if (current.status !== "APPROVED") {
          throw new ServiceError("PROFILE_NOT_APPROVED", "El perfil debe estar aprobado antes de publicarlo.", 409);
        }
        await transaction.query(`UPDATE provider_profiles SET status = 'PUBLISHED' WHERE provider_id = $1`, [providerId]);
        await writeAudit(transaction, context, providerId, "PROVIDER_PROFILE_PUBLISHED");
        return serialize(await readForProvider(transaction, providerId));
      });
    }
  });
}
