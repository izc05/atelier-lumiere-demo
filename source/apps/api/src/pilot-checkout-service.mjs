import { createHash, randomUUID } from "node:crypto";
import { ServiceError } from "./providers-service.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 20;
const MAX_QUANTITY = 10;

function uuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function text(value, field, minimum, maximum, { optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional) return "";
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

function email(value) {
  const normalized = text(value, "email", 5, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", "El correo no es válido.", 422, { field: "email" });
  }
  return normalized;
}

function phone(value) {
  const normalized = text(value, "phone", 6, 40, { optional: true });
  return normalized || null;
}

function quantity(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_QUANTITY) {
    throw new ServiceError("VALIDATION_ERROR", "La cantidad no es válida.", 422, {
      field: "quantity",
      maximum: MAX_QUANTITY
    });
  }
  return parsed;
}

function address(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new ServiceError("VALIDATION_ERROR", "La dirección no es válida.", 422, {
      field: "shippingAddress"
    });
  }
  const country = text(value.country, "shippingAddress.country", 2, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new ServiceError("VALIDATION_ERROR", "El país no es válido.", 422, {
      field: "shippingAddress.country"
    });
  }
  return {
    line1: text(value.line1, "shippingAddress.line1", 3, 180),
    line2: text(value.line2, "shippingAddress.line2", 1, 180, { optional: true }),
    postalCode: text(value.postalCode, "shippingAddress.postalCode", 3, 20),
    city: text(value.city, "shippingAddress.city", 2, 120),
    province: text(value.province, "shippingAddress.province", 2, 120, { optional: true }),
    country
  };
}

function customRequest(value) {
  if (value === undefined || value === null || value === false) return null;
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new ServiceError("VALIDATION_ERROR", "El encargo personalizado no es válido.", 422, {
      field: "customRequest"
    });
  }
  const desiredDate = text(value.desiredDate, "customRequest.desiredDate", 10, 10, { optional: true });
  if (desiredDate && !/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) {
    throw new ServiceError("VALIDATION_ERROR", "La fecha deseada no es válida.", 422, {
      field: "customRequest.desiredDate"
    });
  }
  return {
    title: text(value.title, "customRequest.title", 3, 180),
    brief: text(value.brief, "customRequest.brief", 20, 12000),
    desiredDate: desiredDate || null
  };
}

function personalization(value) {
  if (value === undefined || value === null) return {};
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new ServiceError("VALIDATION_ERROR", "La personalización no es válida.", 422, {
      field: "personalization"
    });
  }
  const entries = Object.entries(value);
  if (entries.length > 20) {
    throw new ServiceError("VALIDATION_ERROR", "Hay demasiadas opciones de personalización.", 422, {
      field: "personalization"
    });
  }
  return Object.fromEntries(entries.map(([key, selected]) => [uuid(key, "personalization.optionId"), selected]));
}

function normalizeInput(input = {}) {
  if (input.website) {
    throw new ServiceError("CHECKOUT_UNAVAILABLE", "No se ha podido registrar el pedido.", 422);
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > MAX_ITEMS) {
    throw new ServiceError("VALIDATION_ERROR", "El carrito debe contener entre uno y veinte artículos.", 422, {
      field: "items",
      maximum: MAX_ITEMS
    });
  }
  const items = input.items.map((item, index) => {
    if (!item || Array.isArray(item) || typeof item !== "object") {
      throw new ServiceError("VALIDATION_ERROR", `items.${index} no es válido.`, 422);
    }
    return {
      productId: uuid(item.productId, `items.${index}.productId`),
      quantity: quantity(item.quantity),
      personalization: personalization(item.personalization),
      customRequest: customRequest(item.customRequest)
    };
  });
  return {
    idempotencyKey: uuid(input.idempotencyKey, "idempotencyKey"),
    customer: {
      name: text(input.customer?.name, "customer.name", 2, 120),
      email: email(input.customer?.email),
      phone: phone(input.customer?.phone),
      shippingAddress: address(input.customer?.shippingAddress)
    },
    customerNote: text(input.customerNote, "customerNote", 1, 4000, { optional: true }),
    items
  };
}

function stablePayload(input) {
  return JSON.stringify({
    ...input,
    items: input.items.map((item) => ({
      ...item,
      personalization: Object.fromEntries(Object.entries(item.personalization).sort(([a], [b]) => a.localeCompare(b)))
    }))
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function internalContext(context) {
  if (!context || context.role !== "ADMIN" || !UUID_PATTERN.test(context.userId ?? "")) {
    throw new TypeError("El checkout piloto necesita un contexto interno de Administración.");
  }
  return context;
}

function money(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 100000000) {
    throw new ServiceError("CHECKOUT_PRODUCT_INVALID", `${field} no está disponible.`, 409);
  }
  return parsed;
}

function orderReference(prefix) {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

function accessUrl(appUrl, token) {
  const url = new URL("/pedido/acceso/", `${appUrl.toString().replace(/\/$/, "")}/`);
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}

function serializeOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    provider: {
      id: row.provider_id,
      displayName: row.provider_display_name
    },
    subtotalCents: row.subtotal_cents,
    shippingCents: row.shipping_cents,
    totalCents: row.total_cents,
    currency: row.currency,
    status: row.status
  };
}

async function completedCheckout(transaction, checkoutId) {
  const checkout = await transaction.query(
    `SELECT id, customer_user_id, checkout_reference, contact_email, customer_name
     FROM checkout_batches
     WHERE id = $1`,
    [checkoutId]
  );
  if (checkout.rowCount !== 1) {
    throw new ServiceError("CHECKOUT_INCONSISTENT", "El checkout guardado no está disponible.", 500);
  }
  const orders = await transaction.query(
    `SELECT orders.*, provider.display_name AS provider_display_name
     FROM provider_orders orders
     INNER JOIN providers provider ON provider.id = orders.provider_id
     WHERE orders.checkout_id = $1
     ORDER BY orders.created_at, orders.id`,
    [checkoutId]
  );
  return {
    checkoutId,
    checkoutReference: checkout.rows[0].checkout_reference,
    customerUserId: checkout.rows[0].customer_user_id,
    email: checkout.rows[0].contact_email,
    displayName: checkout.rows[0].customer_name,
    orders: orders.rows.map(serializeOrder),
    reused: true
  };
}

function selectedOption(option, rawValue) {
  const hasValue = rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== "";
  if (!hasValue) {
    if (option.required) {
      throw new ServiceError(
        "CHECKOUT_PERSONALIZATION_REQUIRED",
        `La opción “${option.name}” es obligatoria.`,
        422,
        { optionId: option.id }
      );
    }
    return null;
  }
  const value = String(rawValue).trim();
  if (value.length > 500) {
    throw new ServiceError("CHECKOUT_PERSONALIZATION_INVALID", "Una personalización es demasiado larga.", 422, {
      optionId: option.id
    });
  }
  if (["SELECT", "COLOR"].includes(option.option_type)) {
    const choices = Array.isArray(option.choices) ? option.choices.map(String) : [];
    if (!choices.includes(value)) {
      throw new ServiceError(
        "CHECKOUT_PERSONALIZATION_INVALID",
        `La selección de “${option.name}” no es válida.`,
        422,
        { optionId: option.id }
      );
    }
  }
  if (option.option_type === "NUMBER" && !Number.isFinite(Number(value))) {
    throw new ServiceError(
      "CHECKOUT_PERSONALIZATION_INVALID",
      `El valor de “${option.name}” debe ser numérico.`,
      422,
      { optionId: option.id }
    );
  }
  return {
    optionId: option.id,
    name: option.name,
    optionType: option.option_type,
    value,
    priceDeltaCents: option.price_delta_cents
  };
}

export function createPilotCheckoutService({
  database,
  systemContext,
  customerAuthService,
  mailService,
  enabled = process.env.PILOT_CHECKOUT_ENABLED === "true",
  shippingCents = Number.parseInt(process.env.PILOT_SHIPPING_CENTS ?? "0", 10),
  appUrl = process.env.APP_URL ?? "http://localhost:3000",
  environment = process.env.NODE_ENV ?? "development",
  logger = console
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createPilotCheckoutService necesita una base de datos.");
  }
  const context = internalContext(systemContext);
  if (!customerAuthService || typeof customerAuthService.issueAccess !== "function") {
    throw new TypeError("createPilotCheckoutService necesita acceso privado de clientes.");
  }
  if (!mailService || typeof mailService.sendCustomerOrderAccess !== "function") {
    throw new TypeError("createPilotCheckoutService necesita correo transaccional.");
  }
  if (!Number.isSafeInteger(shippingCents) || shippingCents < 0 || shippingCents > 1000000) {
    throw new TypeError("PILOT_SHIPPING_CENTS debe ser un importe válido en céntimos.");
  }
  const baseUrl = new URL(appUrl);
  if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
    throw new TypeError("APP_URL no es válida para el checkout.");
  }

  return Object.freeze({
    enabled: Boolean(enabled),

    async submit(rawInput = {}) {
      if (!enabled) {
        throw new ServiceError(
          "PILOT_CHECKOUT_DISABLED",
          "El checkout piloto todavía no está activado.",
          503
        );
      }
      const input = normalizeInput(rawInput);
      const payloadHash = sha256(stablePayload(input));

      const checkout = await database.withContext(context, async (transaction) => {
        const insertedSubmission = await transaction.query(
          `INSERT INTO pilot_checkout_submissions (
             idempotency_key, payload_hash, contact_email
           ) VALUES ($1,$2,$3)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [input.idempotencyKey, payloadHash, input.customer.email]
        );

        if (insertedSubmission.rowCount !== 1) {
          const existing = await transaction.query(
            `SELECT payload_hash, status, checkout_id
             FROM pilot_checkout_submissions
             WHERE idempotency_key = $1
             FOR UPDATE`,
            [input.idempotencyKey]
          );
          if (existing.rowCount !== 1 || existing.rows[0].payload_hash !== payloadHash) {
            throw new ServiceError(
              "CHECKOUT_IDEMPOTENCY_CONFLICT",
              "La clave del checkout ya se utilizó con otros datos.",
              409
            );
          }
          if (existing.rows[0].status !== "COMPLETED" || !existing.rows[0].checkout_id) {
            throw new ServiceError(
              "CHECKOUT_ALREADY_PROCESSING",
              "El checkout ya se está procesando.",
              409
            );
          }
          return completedCheckout(transaction, existing.rows[0].checkout_id);
        }

        const productIds = [...new Set(input.items.map((item) => item.productId))];
        const products = await transaction.query(
          `SELECT product.*, provider.display_name AS provider_display_name,
                  provider.status AS provider_status
           FROM products product
           INNER JOIN providers provider ON provider.id = product.provider_id
           WHERE product.id = ANY($1::uuid[])
           FOR UPDATE OF product`,
          [productIds]
        );
        if (products.rowCount !== productIds.length) {
          throw new ServiceError(
            "CHECKOUT_PRODUCT_UNAVAILABLE",
            "Uno de los artículos ya no está disponible.",
            409
          );
        }
        const productMap = new Map(products.rows.map((row) => [row.id, row]));
        const options = await transaction.query(
          `SELECT id, product_id, name, option_type, required, choices,
                  price_delta_cents, sort_order
           FROM product_personalization_options
           WHERE product_id = ANY($1::uuid[]) AND active = true
           ORDER BY product_id, sort_order, created_at`,
          [productIds]
        );
        const optionsByProduct = new Map();
        for (const option of options.rows) {
          const list = optionsByProduct.get(option.product_id) ?? [];
          list.push(option);
          optionsByProduct.set(option.product_id, list);
        }

        const stockRequested = new Map();
        let currency = null;
        const lines = input.items.map((item) => {
          const product = productMap.get(item.productId);
          if (
            !product
            || product.status !== "PUBLISHED"
            || product.provider_status !== "ACTIVE"
            || product.price_cents === null
          ) {
            throw new ServiceError(
              "CHECKOUT_PRODUCT_UNAVAILABLE",
              "Uno de los artículos ya no está disponible.",
              409,
              { productId: item.productId }
            );
          }
          if (currency && currency !== product.currency) {
            throw new ServiceError(
              "CHECKOUT_CURRENCY_MISMATCH",
              "Todos los artículos deben utilizar la misma moneda.",
              409
            );
          }
          currency = product.currency;
          const productOptions = optionsByProduct.get(product.id) ?? [];
          const optionIds = new Set(productOptions.map((option) => option.id));
          for (const submittedId of Object.keys(item.personalization)) {
            if (!optionIds.has(submittedId)) {
              throw new ServiceError(
                "CHECKOUT_PERSONALIZATION_INVALID",
                "Una opción de personalización ya no está disponible.",
                422,
                { optionId: submittedId }
              );
            }
          }
          const selections = productOptions
            .map((option) => selectedOption(option, item.personalization[option.id]))
            .filter(Boolean);
          const optionDelta = selections.reduce(
            (sum, selection) => sum + money(selection.priceDeltaCents, "priceDeltaCents"),
            0
          );
          const unitPriceCents = money(product.price_cents, "priceCents") + optionDelta;
          if (product.stock_mode === "FINITE") {
            stockRequested.set(
              product.id,
              (stockRequested.get(product.id) ?? 0) + item.quantity
            );
          }
          if (item.customRequest && !product.customizable) {
            throw new ServiceError(
              "CHECKOUT_CUSTOM_REQUEST_NOT_ALLOWED",
              "Este artículo no admite una solicitud de diseño propio.",
              422,
              { productId: product.id }
            );
          }
          return {
            input: item,
            product,
            selections,
            unitPriceCents,
            lineTotalCents: unitPriceCents * item.quantity
          };
        });

        for (const [productId, requested] of stockRequested) {
          const product = productMap.get(productId);
          if (!Number.isInteger(product.stock_quantity) || product.stock_quantity < requested) {
            throw new ServiceError(
              "CHECKOUT_STOCK_UNAVAILABLE",
              `No hay suficientes unidades de “${product.name}”.`,
              409,
              { productId, available: product.stock_quantity ?? 0 }
            );
          }
        }

        let customer = await transaction.query(
          "SELECT id, status FROM users WHERE email = $1",
          [input.customer.email]
        );
        let customerUserId;
        if (customer.rowCount === 0) {
          customer = await transaction.query(
            `INSERT INTO users (email, display_name, status, two_factor_enabled)
             VALUES ($1,$2,'ACTIVE',false)
             RETURNING id, status`,
            [input.customer.email, input.customer.name]
          );
          customerUserId = customer.rows[0].id;
        } else {
          if (customer.rows[0].status !== "ACTIVE") {
            throw new ServiceError(
              "CHECKOUT_CUSTOMER_UNAVAILABLE",
              "No se puede registrar el pedido con este correo.",
              409
            );
          }
          customerUserId = customer.rows[0].id;
        }

        const checkoutId = randomUUID();
        const checkoutReference = orderReference("AL-CHECKOUT");
        await transaction.query(
          `INSERT INTO checkout_batches (
             id, customer_user_id, checkout_reference, currency,
             customer_name, contact_email, contact_phone,
             shipping_address, status, submitted_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'SUBMITTED',now())`,
          [
            checkoutId,
            customerUserId,
            checkoutReference,
            currency ?? "EUR",
            input.customer.name,
            input.customer.email,
            input.customer.phone,
            JSON.stringify(input.customer.shippingAddress)
          ]
        );

        const groups = new Map();
        for (const line of lines) {
          const group = groups.get(line.product.provider_id) ?? {
            provider: line.product,
            lines: []
          };
          group.lines.push(line);
          groups.set(line.product.provider_id, group);
        }

        const createdOrders = [];
        for (const [providerId, group] of groups) {
          const subtotalCents = group.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
          const totalCents = subtotalCents + shippingCents;
          const minDays = group.lines
            .map((line) => line.product.preparation_min_days)
            .filter(Number.isInteger);
          const maxDays = group.lines
            .map((line) => line.product.preparation_max_days)
            .filter(Number.isInteger);
          const orderId = randomUUID();
          const orderNumber = orderReference("AL");
          const orderResult = await transaction.query(
            `INSERT INTO provider_orders (
               id, checkout_id, provider_id, customer_user_id,
               order_number, status, currency, subtotal_cents,
               shipping_cents, total_cents, preparation_min_days,
               preparation_max_days, customer_note, customer_name,
               contact_email, contact_phone, shipping_address
             ) VALUES (
               $1,$2,$3,$4,$5,'PENDING_CONFIRMATION',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb
             ) RETURNING *`,
            [
              orderId,
              checkoutId,
              providerId,
              customerUserId,
              orderNumber,
              currency,
              subtotalCents,
              shippingCents,
              totalCents,
              minDays.length ? Math.max(...minDays) : null,
              maxDays.length ? Math.max(...maxDays) : null,
              input.customerNote,
              input.customer.name,
              input.customer.email,
              input.customer.phone,
              JSON.stringify(input.customer.shippingAddress)
            ]
          );

          for (const line of group.lines) {
            const itemId = randomUUID();
            await transaction.query(
              `INSERT INTO order_items (
                 id, order_id, provider_id, customer_user_id,
                 product_id, item_type, product_name, product_slug,
                 product_story_snapshot, quantity, unit_price_cents,
                 line_total_cents, currency, personalization
               ) VALUES ($1,$2,$3,$4,$5,'PRODUCT',$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
              [
                itemId,
                orderId,
                providerId,
                customerUserId,
                line.product.id,
                line.product.name,
                line.product.slug,
                line.product.story,
                line.input.quantity,
                line.unitPriceCents,
                line.lineTotalCents,
                currency,
                JSON.stringify({ options: line.selections })
              ]
            );
            if (line.input.customRequest) {
              await transaction.query(
                `INSERT INTO custom_requests (
                   order_id, order_item_id, provider_id, customer_user_id,
                   title, brief, desired_date, status, currency
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',$8)`,
                [
                  orderId,
                  itemId,
                  providerId,
                  customerUserId,
                  line.input.customRequest.title,
                  line.input.customRequest.brief,
                  line.input.customRequest.desiredDate,
                  currency
                ]
              );
            }
          }

          createdOrders.push({
            ...serializeOrder({
              ...orderResult.rows[0],
              provider_display_name: group.provider.provider_display_name
            })
          });
        }

        for (const [productId, requested] of stockRequested) {
          const reserved = await transaction.query(
            `UPDATE products
             SET stock_quantity = stock_quantity - $2
             WHERE id = $1 AND stock_mode = 'FINITE' AND stock_quantity >= $2
             RETURNING id`,
            [productId, requested]
          );
          if (reserved.rowCount !== 1) {
            throw new ServiceError(
              "CHECKOUT_STOCK_UNAVAILABLE",
              "El stock cambió mientras se procesaba el pedido.",
              409,
              { productId }
            );
          }
        }

        await transaction.query(
          `UPDATE pilot_checkout_submissions
           SET status='COMPLETED', checkout_id=$2, completed_at=now()
           WHERE idempotency_key=$1`,
          [input.idempotencyKey, checkoutId]
        );
        await transaction.query(
          `INSERT INTO audit_events (
             actor_user_id, action, entity_type, entity_id, metadata
           ) VALUES ($1,'PILOT_CHECKOUT_SUBMITTED','checkout_batch',$2,$3::jsonb)`,
          [
            context.userId,
            checkoutId,
            JSON.stringify({
              checkoutReference,
              orderCount: createdOrders.length,
              itemCount: lines.length,
              paymentCollected: false
            })
          ]
        );

        return {
          checkoutId,
          checkoutReference,
          customerUserId,
          email: input.customer.email,
          displayName: input.customer.name,
          orders: createdOrders,
          reused: false
        };
      });

      const access = await customerAuthService.issueAccess({
        customerUserId: checkout.customerUserId,
        checkoutId: checkout.checkoutId
      });
      const manualAccessUrl = accessUrl(baseUrl, access.accessToken);
      let delivery;
      try {
        delivery = await mailService.sendCustomerOrderAccess({
          to: checkout.email,
          displayName: checkout.displayName,
          token: access.accessToken,
          expiresAt: access.expiresAt,
          orderNumbers: checkout.orders.map((order) => order.orderNumber)
        });
      } catch (error) {
        logger.error("El checkout se guardó, pero falló el correo de acceso.", {
          code: typeof error?.code === "string" ? error.code : "CUSTOMER_ACCESS_EMAIL_FAILED"
        });
        delivery = { status: "FAILED", messageId: null, accepted: [] };
      }

      return {
        checkoutId: checkout.checkoutId,
        checkoutReference: checkout.checkoutReference,
        status: "SUBMITTED",
        paymentCollected: false,
        reused: checkout.reused,
        orders: checkout.orders,
        access: {
          expiresAt: access.expiresAt,
          delivery: delivery.status,
          ...(environment === "production" ? {} : { manualAccessUrl })
        }
      };
    }
  });
}
