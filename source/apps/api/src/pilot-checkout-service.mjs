import { createPilotCheckoutService as createCorePilotCheckoutService } from "./pilot-checkout-service-core.mjs";

const PUBLISHED_PRODUCTS_QUERY = `SELECT inventory.id,
       inventory.provider_id,
       publication.snapshot #>> '{product,slug}' AS slug,
       publication.snapshot #>> '{product,name}' AS name,
       publication.snapshot #>> '{product,story}' AS story,
       (publication.snapshot #>> '{product,priceCents}')::integer AS price_cents,
       COALESCE(publication.snapshot #>> '{product,currency}', 'EUR') AS currency,
       inventory.stock_mode,
       inventory.stock_quantity,
       COALESCE((publication.snapshot #>> '{product,customizable}')::boolean, false) AS customizable,
       NULLIF(publication.snapshot #>> '{product,preparationMinDays}', '')::integer AS preparation_min_days,
       NULLIF(publication.snapshot #>> '{product,preparationMaxDays}', '')::integer AS preparation_max_days,
       'PUBLISHED'::text AS status,
       provider.display_name AS provider_display_name,
       provider.status AS provider_status
FROM products inventory
INNER JOIN product_publications publication
        ON publication.product_id = inventory.id
       AND publication.provider_id = inventory.provider_id
       AND publication.visible = true
INNER JOIN providers provider ON provider.id = inventory.provider_id
WHERE inventory.id = ANY($1::uuid[])
FOR UPDATE OF inventory`;

const PUBLISHED_OPTIONS_QUERY = `SELECT (item.value ->> 'id')::uuid AS id,
       publication.product_id,
       item.value ->> 'name' AS name,
       item.value ->> 'optionType' AS option_type,
       COALESCE((item.value ->> 'required')::boolean, false) AS required,
       COALESCE(item.value -> 'choices', '[]'::jsonb) AS choices,
       COALESCE((item.value ->> 'priceDeltaCents')::integer, 0) AS price_delta_cents,
       COALESCE((item.value ->> 'sortOrder')::integer, 0) AS sort_order
FROM product_publications publication
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(publication.snapshot -> 'personalizations', '[]'::jsonb)
) WITH ORDINALITY AS item(value, ordinality)
WHERE publication.product_id = ANY($1::uuid[])
  AND publication.visible = true
ORDER BY publication.product_id,
         COALESCE((item.value ->> 'sortOrder')::integer, 0),
         item.ordinality`;

function normalizedSql(statement) {
  return typeof statement === "string"
    ? statement.replace(/\s+/g, " ").trim()
    : "";
}

function isLegacyProductRead(statement) {
  const sql = normalizedSql(statement);
  return sql.includes("SELECT product.*, provider.display_name AS provider_display_name")
    && sql.includes("FROM products product")
    && sql.includes("FOR UPDATE OF product");
}

function isLegacyPersonalizationRead(statement) {
  const sql = normalizedSql(statement);
  return sql.includes("FROM product_personalization_options")
    && sql.includes("WHERE product_id = ANY($1::uuid[])")
    && sql.includes("active = true");
}

function publishedCheckoutDatabase(database) {
  return Object.freeze({
    async withContext(context, work) {
      return database.withContext(context, async (transaction) => {
        const adaptedTransaction = Object.freeze({
          query(statement, values) {
            if (isLegacyProductRead(statement)) {
              return transaction.query(PUBLISHED_PRODUCTS_QUERY, values);
            }
            if (isLegacyPersonalizationRead(statement)) {
              return transaction.query(PUBLISHED_OPTIONS_QUERY, values);
            }
            return transaction.query(statement, values);
          }
        });

        return work(adaptedTransaction);
      });
    }
  });
}

export function createPilotCheckoutService(options = {}) {
  if (!options.database || typeof options.database.withContext !== "function") {
    return createCorePilotCheckoutService(options);
  }
  return createCorePilotCheckoutService({
    ...options,
    database: publishedCheckoutDatabase(options.database)
  });
}
