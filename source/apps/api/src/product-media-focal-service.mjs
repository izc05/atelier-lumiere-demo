import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_PRODUCT_STATUSES = new Set(["DRAFT", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED"]);

function uuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
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

function coordinate(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${field} debe ser un número entero entre 0 y 100.`,
      422,
      { field }
    );
  }
  return parsed;
}

function boolean(value, field) {
  if (typeof value !== "boolean") {
    throw new ServiceError("VALIDATION_ERROR", `${field} debe ser verdadero o falso.`, 422, { field });
  }
  return value;
}

function translateDatabaseError(error) {
  if (error instanceof ServiceError) return error;
  const message = String(error?.message ?? "");
  if (error?.code === "42501") {
    if (message.includes("PUBLICATION")) {
      return new ServiceError(
        "PUBLICATION_LOCKED",
        "La publicación no se puede modificar en este momento.",
        409
      );
    }
    return new ServiceError(
      "FOCAL_POINT_LOCKED",
      "El encuadre no se puede modificar durante la revisión o después de archivar la pieza.",
      409
    );
  }
  if (error?.code === "23514" && message.includes("PRODUCT_MEDIA_FOCAL_TARGET_INVALID")) {
    return new ServiceError(
      "MEDIA_NOT_AVAILABLE",
      "La fotografía ya no está disponible para ajustar su encuadre.",
      409
    );
  }
  if (error?.code === "23514" && message.includes("PRODUCT_STATUS")) {
    return new ServiceError(
      "PRODUCT_STATUS_CONFLICT",
      "El artículo ya no se encuentra en el estado esperado. Recarga la ficha.",
      409
    );
  }
  return error;
}

function mediaItem(row) {
  return {
    id: row.id,
    productId: row.product_id,
    originalFilename: row.original_filename,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    width: row.width,
    height: row.height,
    focalX: Number(row.focal_x ?? 50),
    focalY: Number(row.focal_y ?? 50),
    previewPath: `/api/provider/products/${row.product_id}/media/${row.id}/preview`
  };
}

function publicationItem(row) {
  if (row.publication_revision === null || row.publication_revision === undefined) {
    return {
      exists: false,
      visible: false,
      revision: null,
      publishedAt: null,
      pausedAt: null,
      updatedAt: null
    };
  }
  return {
    exists: true,
    visible: Boolean(row.publication_visible),
    revision: Number(row.publication_revision),
    publishedAt: row.publication_published_at,
    pausedAt: row.publication_paused_at,
    updatedAt: row.publication_updated_at
  };
}

async function writeAudit(transaction, context, action, productId, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'product', $4, $5::jsonb)`,
    [context.userId, context.providerId, action, productId, JSON.stringify(metadata)]
  );
}

export function createProductMediaFocalService({ database } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createProductMediaFocalService necesita una base de datos.");
  }

  return Object.freeze({
    async list(rawContext, rawProductId) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      try {
        return await database.withContext(context, async (transaction) => {
          const productResult = await transaction.query(
            `SELECT product.id, product.status,
                    publication.revision AS publication_revision,
                    publication.visible AS publication_visible,
                    publication.published_at AS publication_published_at,
                    publication.paused_at AS publication_paused_at,
                    publication.updated_at AS publication_updated_at
             FROM products product
             LEFT JOIN product_publications publication ON publication.product_id = product.id
             WHERE product.id = $1`,
            [productId]
          );
          if (productResult.rowCount !== 1) {
            throw new ServiceError("PRODUCT_NOT_FOUND", "No se ha encontrado el artículo.", 404);
          }
          const product = productResult.rows[0];
          const result = await transaction.query(
            `SELECT media.id, media.product_id, media.original_filename, media.alt_text,
                    media.sort_order, media.width, media.height,
                    COALESCE(focal.focal_x, 50) AS focal_x,
                    COALESCE(focal.focal_y, 50) AS focal_y
             FROM product_media media
             LEFT JOIN product_media_focal_points focal ON focal.media_id = media.id
             WHERE media.product_id = $1
               AND media.kind = 'IMAGE'
               AND media.status = 'READY'
               AND media.preview_storage_key IS NOT NULL
             ORDER BY media.sort_order, media.created_at`,
            [productId]
          );
          return {
            productId,
            productStatus: product.status,
            editable: ALLOWED_PRODUCT_STATUSES.has(product.status),
            publication: publicationItem(product),
            media: result.rows.map(mediaItem)
          };
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async update(rawContext, rawProductId, rawMediaId, input = {}) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const mediaId = uuid(rawMediaId, "mediaId");
      const focalX = coordinate(input.focalX, "focalX");
      const focalY = coordinate(input.focalY, "focalY");

      try {
        return await database.withContext(context, async (transaction) => {
          const productResult = await transaction.query(
            `SELECT id, status
             FROM products
             WHERE id = $1
             FOR SHARE`,
            [productId]
          );
          if (productResult.rowCount !== 1) {
            throw new ServiceError("PRODUCT_NOT_FOUND", "No se ha encontrado el artículo.", 404);
          }
          if (!ALLOWED_PRODUCT_STATUSES.has(productResult.rows[0].status)) {
            throw new ServiceError(
              "FOCAL_POINT_LOCKED",
              "El encuadre no se puede modificar durante la revisión o después de archivar la pieza.",
              409
            );
          }

          const mediaResult = await transaction.query(
            `SELECT id, provider_id, product_id
             FROM product_media
             WHERE id = $1
               AND product_id = $2
               AND kind = 'IMAGE'
               AND status = 'READY'`,
            [mediaId, productId]
          );
          if (mediaResult.rowCount !== 1) {
            throw new ServiceError(
              "MEDIA_NOT_FOUND",
              "No se ha encontrado la fotografía.",
              404
            );
          }

          const result = await transaction.query(
            `INSERT INTO product_media_focal_points
              (media_id, provider_id, product_id, focal_x, focal_y, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (media_id) DO UPDATE
             SET focal_x = EXCLUDED.focal_x,
                 focal_y = EXCLUDED.focal_y,
                 updated_by = EXCLUDED.updated_by,
                 updated_at = now()
             RETURNING media_id, product_id, focal_x, focal_y, updated_at`,
            [mediaId, context.providerId, productId, focalX, focalY, context.userId]
          );

          await transaction.query(
            `INSERT INTO audit_events
              (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
             VALUES ($1, $2, 'PRODUCT_MEDIA_FOCAL_UPDATED', 'product_media', $3, $4::jsonb)`,
            [
              context.userId,
              context.providerId,
              mediaId,
              JSON.stringify({ productId, focalX, focalY })
            ]
          );

          return {
            mediaId: result.rows[0].media_id,
            productId: result.rows[0].product_id,
            focalX: Number(result.rows[0].focal_x),
            focalY: Number(result.rows[0].focal_y),
            updatedAt: result.rows[0].updated_at
          };
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async startPublishedEdit(rawContext, rawProductId) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      try {
        return await database.withContext(context, async (transaction) => {
          const result = await transaction.query(
            `SELECT product.id, product.status, product.version,
                    publication.revision AS publication_revision,
                    publication.visible AS publication_visible,
                    publication.published_at AS publication_published_at,
                    publication.paused_at AS publication_paused_at,
                    publication.updated_at AS publication_updated_at
             FROM products product
             LEFT JOIN product_publications publication ON publication.product_id = product.id
             WHERE product.id = $1
             FOR UPDATE OF product`,
            [productId]
          );
          if (result.rowCount !== 1) {
            throw new ServiceError("PRODUCT_NOT_FOUND", "No se ha encontrado el artículo.", 404);
          }
          const current = result.rows[0];
          if (current.status !== "PUBLISHED") {
            throw new ServiceError(
              "PRODUCT_NOT_PUBLISHED",
              "El artículo ya no está publicado. Recarga la ficha.",
              409
            );
          }
          const publication = publicationItem(current);
          if (!publication.exists) {
            throw new ServiceError(
              "PUBLICATION_NOT_FOUND",
              "La versión pública todavía no está preparada. Actualiza Atelier antes de editar.",
              409
            );
          }

          const updated = await transaction.query(
            `UPDATE products
             SET status = 'DRAFT'
             WHERE id = $1
             RETURNING status, version, updated_at`,
            [productId]
          );
          await writeAudit(transaction, context, "PRODUCT_PUBLISHED_EDIT_STARTED", productId, {
            publicRevision: publication.revision,
            publicVisible: publication.visible,
            previousVersion: Number(current.version),
            draftVersion: Number(updated.rows[0].version)
          });
          return {
            productId,
            productStatus: updated.rows[0].status,
            version: Number(updated.rows[0].version),
            updatedAt: updated.rows[0].updated_at,
            publication
          };
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    },

    async setPublicationVisibility(rawContext, rawProductId, rawVisible) {
      const context = providerContext(rawContext);
      const productId = uuid(rawProductId, "productId");
      const visible = boolean(rawVisible, "visible");
      try {
        return await database.withContext(context, async (transaction) => {
          const productResult = await transaction.query(
            "SELECT id FROM products WHERE id = $1 FOR SHARE",
            [productId]
          );
          if (productResult.rowCount !== 1) {
            throw new ServiceError("PRODUCT_NOT_FOUND", "No se ha encontrado el artículo.", 404);
          }
          const result = await transaction.query(
            `UPDATE product_publications
             SET visible = $2
             WHERE product_id = $1
             RETURNING revision AS publication_revision,
                       visible AS publication_visible,
                       published_at AS publication_published_at,
                       paused_at AS publication_paused_at,
                       updated_at AS publication_updated_at`,
            [productId, visible]
          );
          if (result.rowCount !== 1) {
            throw new ServiceError(
              "PUBLICATION_NOT_FOUND",
              "El artículo todavía no tiene una versión pública.",
              409
            );
          }
          const publication = publicationItem(result.rows[0]);
          await writeAudit(
            transaction,
            context,
            visible ? "PRODUCT_PUBLICATION_RESUMED" : "PRODUCT_PUBLICATION_PAUSED",
            productId,
            { publicRevision: publication.revision }
          );
          return { productId, publication };
        });
      } catch (error) {
        throw translateDatabaseError(error);
      }
    }
  });
}
