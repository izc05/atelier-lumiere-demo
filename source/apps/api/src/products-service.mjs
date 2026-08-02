import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STOCK_MODES = new Set(["FINITE", "MADE_TO_ORDER", "UNLIMITED"]);
const OPTION_TYPES = new Set(["TEXT", "SELECT", "COLOR", "NUMBER"]);

function uuid(value, field = "id") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function text(value, field, { min = 0, max, nullable = false } = {}) {
  if ((value === undefined || value === null || value === "") && nullable) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < min || normalized.length > max) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return normalized;
}

function integer(value, field, { min = 0, max, nullable = false } = {}) {
  if ((value === undefined || value === null || value === "") && nullable) return null;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value;
}

function boolean(value, field) {
  if (typeof value !== "boolean") {
    throw new ServiceError("VALIDATION_ERROR", `${field} debe ser verdadero o falso.`, 422, { field });
  }
  return value;
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function productSlug(value, name) {
  const slug = slugify(typeof value === "string" && value.trim() ? value : name);
  if (!SLUG_PATTERN.test(slug)) {
    throw new ServiceError("VALIDATION_ERROR", "No se ha podido crear una URL válida.", 422, {
      field: "slug"
    });
  }
  return slug;
}

function providerContext(context) {
  if (
    !context
    || !UUID_PATTERN.test(context.userId ?? "")
    || !UUID_PATTERN.test(context.providerId ?? "")
    || !["PROVIDER_OWNER", "PROVIDER_MEMBER"].includes(context.role)
  ) {
    throw new ServiceError("UNAUTHORIZED", "La sesión del proveedor no es válida.", 401);
  }
  return {
    userId: context.userId.toLowerCase(),
    providerId: context.providerId.toLowerCase(),
    role: context.role
  };
}

function stock(input, current = {}) {
  const stockMode = input.stockMode ?? current.stock_mode ?? "FINITE";
  if (!STOCK_MODES.has(stockMode)) {
    throw new ServiceError("VALIDATION_ERROR", "El tipo de existencias no es válido.", 422, {
      field: "stockMode"
    });
  }
  const stockQuantity = stockMode === "FINITE"
    ? integer(input.stockQuantity ?? current.stock_quantity ?? 0, "stockQuantity", {
        min: 0,
        max: 100000000
      })
    : null;
  return { stockMode, stockQuantity };
}

function productFields(input, current = {}) {
  const name = text(input.name ?? current.name, "name", { min: 2, max: 180 });
  const stockValues = stock(input, current);
  const minDays = integer(
    input.preparationMinDays ?? current.preparation_min_days,
    "preparationMinDays",
    { min: 0, max: 365, nullable: true }
  );
  const maxDays = integer(
    input.preparationMaxDays ?? current.preparation_max_days,
    "preparationMaxDays",
    { min: 0, max: 365, nullable: true }
  );
  if (minDays !== null && maxDays !== null && minDays > maxDays) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "El tiempo mínimo no puede superar al máximo.",
      422,
      { field: "preparationMaxDays" }
    );
  }

  return {
    slug: productSlug(input.slug ?? current.slug, name),
    name,
    shortDescription: text(
      input.shortDescription ?? current.short_description ?? "",
      "shortDescription",
      { max: 320 }
    ),
    story: text(input.story ?? current.story ?? "", "story", { max: 12000 }),
    category: text(input.category ?? current.category, "category", {
      min: 2,
      max: 80,
      nullable: true
    }),
    priceCents: integer(input.priceCents ?? current.price_cents, "priceCents", {
      min: 0,
      max: 100000000,
      nullable: true
    }),
    ...stockValues,
    preparationMinDays: minDays,
    preparationMaxDays: maxDays,
    customizable: input.customizable === undefined
      ? Boolean(current.customizable)
      : boolean(input.customizable, "customizable"),
    personalizationNotes: text(
      input.personalizationNotes ?? current.personalization_notes ?? "",
      "personalizationNotes",
      { max: 4000 }
    ),
    shippingNotes: text(
      input.shippingNotes ?? current.shipping_notes ?? "",
      "shippingNotes",
      { max: 4000 }
    )
  };
}

function events(value) {
  if (!Array.isArray(value) || value.length > 20) {
    throw new ServiceError("VALIDATION_ERROR", "Las ocasiones no son válidas.", 422, {
      field: "events"
    });
  }
  const unique = [...new Set(value.map((item) => String(item).trim().toLowerCase()))];
  if (unique.some((item) => !EVENT_PATTERN.test(item))) {
    throw new ServiceError("VALIDATION_ERROR", "Hay una ocasión no válida.", 422, {
      field: "events"
    });
  }
  return unique;
}

function personalizationOptions(value) {
  if (!Array.isArray(value) || value.length > 20) {
    throw new ServiceError("VALIDATION_ERROR", "Las opciones de personalización no son válidas.", 422, {
      field: "personalizations"
    });
  }
  return value.map((item, index) => {
    const optionType = item?.optionType;
    if (!OPTION_TYPES.has(optionType)) {
      throw new ServiceError("VALIDATION_ERROR", "El tipo de personalización no es válido.", 422, {
        field: `personalizations.${index}.optionType`
      });
    }
    const choices = optionType === "SELECT" || optionType === "COLOR"
      ? Array.isArray(item.choices)
        ? [...new Set(item.choices.map((choice) => text(choice, "choice", { min: 1, max: 80 })))]
        : []
      : [];
    if ((optionType === "SELECT" || optionType === "COLOR") && (choices.length < 1 || choices.length > 50)) {
      throw new ServiceError("VALIDATION_ERROR", "La opción necesita entre 1 y 50 valores.", 422, {
        field: `personalizations.${index}.choices`
      });
    }
    return {
      name: text(item?.name, "name", { min: 2, max: 120 }),
      optionType,
      required: item?.required === undefined ? false : boolean(item.required, "required"),
      choices,
      priceDeltaCents: integer(item?.priceDeltaCents ?? 0, "priceDeltaCents", {
        min: 0,
        max: 100000000
      }),
      sortOrder: index
    };
  });
}

function serializeProduct(row) {
  return {
    id: row.id,
    providerId: row.provider_id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    story: row.story,
    category: row.category,
    priceCents: row.price_cents,
    currency: row.currency,
    stockMode: row.stock_mode,
    stockQuantity: row.stock_quantity,
    preparationMinDays: row.preparation_min_days,
    preparationMaxDays: row.preparation_max_days,
    customizable: row.customizable,
    personalizationNotes: row.personalization_notes,
    shippingNotes: row.shipping_notes,
    status: row.status,
    version: row.version,
    imageCount: Number(row.image_count ?? 0),
    videoCount: Number(row.video_count ?? 0),
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function translateDatabaseError(error) {
  if (error instanceof ServiceError) return error;
  if (error?.code === "23505") {
    return new ServiceError("PRODUCT_CONFLICT", "Ya existe un artículo con esa URL.", 409);
  }
  if (error?.code === "42501") {
    return new ServiceError("PRODUCT_LOCKED", "El artículo no se puede modificar en su estado actual.", 409);
  }
  if (error?.code === "23514") {
    if (String(error.message).includes("PRODUCT_NOT_READY_FOR_REVIEW")) {
      return new ServiceError(
        "PRODUCT_NOT_READY_FOR_REVIEW",
        "Completa la ficha y añade al menos una imagen antes de enviarla a revisión.",
        422
      );
    }
    return new ServiceError("VALIDATION_ERROR", "El artículo no cumple las reglas del catálogo.", 422);
  }
  return error;
}

async function audit(transaction, context, action, entityId, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'product', $4, $5::jsonb)`,
    [context.userId, context.providerId, action, entityId, JSON.stringify(metadata)]
  );
}

async function loadProduct(transaction, productId, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT * FROM products WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [productId]
  );
  return result.rows[0] ?? null;
}

function notFound() {
  return new ServiceError("PRODUCT_NOT_FOUND", "No se ha encontrado el artículo.", 404);
}

export function createProductsService({ database } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createProductsService necesita una base de datos.");
  }

  return Object.freeze({
    async list(rawContext) {
      const context = providerContext(rawContext);
      try {
        return await database.withContext(context, async (transaction) => {
          const result = await transaction.query(
            `SELECT p.*,
                    COUNT(pm.id) FILTER (WHERE pm.kind = 'IMAGE' AND pm.status <> 'DELETED') AS image_count,
                    COUNT(pm.id) FILTER (WHERE pm.kind = 'VIDEO' AND pm.status <> 'DELETED') AS video_count
             FROM products p
             LEFT JOIN product_media pm ON pm.product_id = p.id
             GROUP BY p.id
             ORDER BY p.updated_at DESC, p.created_at DESC`
          );
          return result.rows.map(serializeProduct);
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async get(rawContext, rawProductId) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      try {
        return await database.withContext(context, async (transaction) => {
          const productResult = await transaction.query(
            `SELECT p.*,
                    COUNT(pm.id) FILTER (WHERE pm.kind = 'IMAGE' AND pm.status <> 'DELETED') AS image_count,
                    COUNT(pm.id) FILTER (WHERE pm.kind = 'VIDEO' AND pm.status <> 'DELETED') AS video_count
             FROM products p
             LEFT JOIN product_media pm ON pm.product_id = p.id
             WHERE p.id = $1
             GROUP BY p.id`,
            [productId]
          );
          if (productResult.rowCount !== 1) throw notFound();

          const [eventResult, optionResult, mediaResult, reviewResult] = await Promise.all([
            transaction.query(
              "SELECT event_slug FROM product_events WHERE product_id = $1 ORDER BY event_slug",
              [productId]
            ),
            transaction.query(
              `SELECT id, name, option_type, required, choices, price_delta_cents, sort_order, active
               FROM product_personalization_options
               WHERE product_id = $1
               ORDER BY sort_order, created_at`,
              [productId]
            ),
            transaction.query(
              `SELECT id, kind, mime_type, original_filename, size_bytes, status, sort_order,
                      alt_text, width, height, duration_seconds, rejection_reason, created_at
               FROM product_media
               WHERE product_id = $1 AND status <> 'DELETED'
               ORDER BY kind, sort_order, created_at`,
              [productId]
            ),
            transaction.query(
              `SELECT id, submission_number, status, provider_note, reviewer_note,
                      submitted_at, reviewed_at
               FROM product_reviews
               WHERE product_id = $1
               ORDER BY submission_number DESC`,
              [productId]
            )
          ]);

          return {
            ...serializeProduct(productResult.rows[0]),
            events: eventResult.rows.map((row) => row.event_slug),
            personalizations: optionResult.rows.map((row) => ({
              id: row.id,
              name: row.name,
              optionType: row.option_type,
              required: row.required,
              choices: row.choices,
              priceDeltaCents: row.price_delta_cents,
              sortOrder: row.sort_order,
              active: row.active
            })),
            media: mediaResult.rows.map((row) => ({
              id: row.id,
              kind: row.kind,
              mimeType: row.mime_type,
              originalFilename: row.original_filename,
              sizeBytes: Number(row.size_bytes),
              status: row.status,
              sortOrder: row.sort_order,
              altText: row.alt_text,
              width: row.width,
              height: row.height,
              durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
              rejectionReason: row.rejection_reason,
              createdAt: row.created_at
            })),
            reviews: reviewResult.rows.map((row) => ({
              id: row.id,
              submissionNumber: row.submission_number,
              status: row.status,
              providerNote: row.provider_note,
              reviewerNote: row.reviewer_note,
              submittedAt: row.submitted_at,
              reviewedAt: row.reviewed_at
            }))
          };
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async create(rawContext, input = {}) {
      const context = providerContext(rawContext);
      const fields = productFields(input);
      try {
        return await database.withContext(context, async (transaction) => {
          const result = await transaction.query(
            `INSERT INTO products (
               provider_id, slug, name, short_description, story, category,
               price_cents, stock_mode, stock_quantity,
               preparation_min_days, preparation_max_days,
               customizable, personalization_notes, shipping_notes,
               created_by, updated_by
             ) VALUES (
               $1, $2, $3, $4, $5, $6,
               $7, $8, $9, $10, $11, $12, $13, $14, $15, $15
             ) RETURNING *`,
            [
              context.providerId,
              fields.slug,
              fields.name,
              fields.shortDescription,
              fields.story,
              fields.category,
              fields.priceCents,
              fields.stockMode,
              fields.stockQuantity,
              fields.preparationMinDays,
              fields.preparationMaxDays,
              fields.customizable,
              fields.personalizationNotes,
              fields.shippingNotes,
              context.userId
            ]
          );
          const product = serializeProduct(result.rows[0]);
          await audit(transaction, context, "PRODUCT_CREATED", product.id, { version: product.version });
          return product;
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async update(rawContext, rawProductId, input = {}) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const expectedVersion = integer(input.expectedVersion, "expectedVersion", { min: 1, max: 100000000 });
      try {
        return await database.withContext(context, async (transaction) => {
          const current = await loadProduct(transaction, productId, { lock: true });
          if (!current) throw notFound();
          if (Number(current.version) !== expectedVersion) {
            throw new ServiceError(
              "PRODUCT_VERSION_CONFLICT",
              "El artículo ha cambiado. Recarga la ficha antes de guardar.",
              409,
              { currentVersion: Number(current.version) }
            );
          }
          const fields = productFields(input, current);
          const result = await transaction.query(
            `UPDATE products SET
               slug = $2, name = $3, short_description = $4, story = $5, category = $6,
               price_cents = $7, stock_mode = $8, stock_quantity = $9,
               preparation_min_days = $10, preparation_max_days = $11,
               customizable = $12, personalization_notes = $13, shipping_notes = $14
             WHERE id = $1
             RETURNING *`,
            [
              productId,
              fields.slug,
              fields.name,
              fields.shortDescription,
              fields.story,
              fields.category,
              fields.priceCents,
              fields.stockMode,
              fields.stockQuantity,
              fields.preparationMinDays,
              fields.preparationMaxDays,
              fields.customizable,
              fields.personalizationNotes,
              fields.shippingNotes
            ]
          );
          const product = serializeProduct(result.rows[0]);
          await audit(transaction, context, "PRODUCT_UPDATED", product.id, {
            previousVersion: expectedVersion,
            version: product.version
          });
          return product;
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async replaceEvents(rawContext, rawProductId, input = {}) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const values = events(input.events);
      try {
        return await database.withContext(context, async (transaction) => {
          const product = await loadProduct(transaction, productId, { lock: true });
          if (!product) throw notFound();
          await transaction.query("DELETE FROM product_events WHERE product_id = $1", [productId]);
          for (const eventSlug of values) {
            await transaction.query(
              "INSERT INTO product_events (provider_id, product_id, event_slug) VALUES ($1, $2, $3)",
              [context.providerId, productId, eventSlug]
            );
          }
          await audit(transaction, context, "PRODUCT_EVENTS_REPLACED", productId, {
            count: values.length
          });
          return values;
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async replacePersonalizations(rawContext, rawProductId, input = {}) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const values = personalizationOptions(input.personalizations);
      try {
        return await database.withContext(context, async (transaction) => {
          const product = await loadProduct(transaction, productId, { lock: true });
          if (!product) throw notFound();
          await transaction.query(
            "DELETE FROM product_personalization_options WHERE product_id = $1",
            [productId]
          );
          for (const option of values) {
            await transaction.query(
              `INSERT INTO product_personalization_options (
                 provider_id, product_id, name, option_type, required,
                 choices, price_delta_cents, sort_order
               ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
              [
                context.providerId,
                productId,
                option.name,
                option.optionType,
                option.required,
                JSON.stringify(option.choices),
                option.priceDeltaCents,
                option.sortOrder
              ]
            );
          }
          await audit(transaction, context, "PRODUCT_PERSONALIZATIONS_REPLACED", productId, {
            count: values.length
          });
          return values;
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async submit(rawContext, rawProductId, input = {}) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const expectedVersion = integer(input.expectedVersion, "expectedVersion", { min: 1, max: 100000000 });
      const providerNote = text(input.providerNote ?? "", "providerNote", { max: 4000 });
      try {
        return await database.withContext(context, async (transaction) => {
          const current = await loadProduct(transaction, productId, { lock: true });
          if (!current) throw notFound();
          if (Number(current.version) !== expectedVersion) {
            throw new ServiceError("PRODUCT_VERSION_CONFLICT", "El artículo ha cambiado.", 409, {
              currentVersion: Number(current.version)
            });
          }

          const productResult = await transaction.query(
            "UPDATE products SET status = 'IN_REVIEW' WHERE id = $1 RETURNING *",
            [productId]
          );
          const numberResult = await transaction.query(
            "SELECT COALESCE(MAX(submission_number), 0) + 1 AS next_number FROM product_reviews WHERE product_id = $1",
            [productId]
          );
          const submissionNumber = Number(numberResult.rows[0].next_number);
          const reviewResult = await transaction.query(
            `INSERT INTO product_reviews (
               provider_id, product_id, submission_number, provider_note, submitted_by
             ) VALUES ($1, $2, $3, $4, $5)
             RETURNING id, submission_number, status, submitted_at`,
            [context.providerId, productId, submissionNumber, providerNote, context.userId]
          );
          const product = serializeProduct(productResult.rows[0]);
          await audit(transaction, context, "PRODUCT_SUBMITTED_FOR_REVIEW", productId, {
            submissionNumber,
            version: product.version
          });
          return {
            product,
            review: {
              id: reviewResult.rows[0].id,
              submissionNumber: reviewResult.rows[0].submission_number,
              status: reviewResult.rows[0].status,
              submittedAt: reviewResult.rows[0].submitted_at
            }
          };
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    }
  });
}
