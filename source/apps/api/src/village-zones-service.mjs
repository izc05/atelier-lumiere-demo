import { ServiceError } from "./providers-service.mjs";
import { VILLAGE_ZONE_KEYS, VILLAGE_ZONE_META, VILLAGE_ZONE_SET } from "./village-zones.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const STATUS_SET = new Set(["ACTIVE", "RESERVED", "HIDDEN"]);
const PUBLIC_CONTEXT = Object.freeze({
  role: "CATALOG_READER",
  userId: "00000000-0000-4000-8000-000000000002",
  providerId: null
});

function adminContext(context) {
  if (context?.role !== "ADMIN" || !UUID_PATTERN.test(String(context.userId || ""))) {
    throw new ServiceError("UNAUTHORIZED", "Necesitas una sesión administrativa.", 401);
  }
  return { role: "ADMIN", userId: String(context.userId).toLowerCase(), providerId: null };
}

function zoneKey(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!VILLAGE_ZONE_SET.has(normalized)) {
    throw new ServiceError("VILLAGE_ZONE_INVALID", "La zona del Pueblo Atelier no existe.", 422, { field: "zoneKey" });
  }
  return normalized;
}

function cleanText(value, field, maximum) {
  if (value === undefined || value === null) return "";
  const normalized = String(value).normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (normalized.length > maximum) {
    throw new ServiceError("VALIDATION_ERROR", `${field} es demasiado largo.`, 422, { field });
  }
  return normalized;
}

function providerSlug(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (!PROVIDER_SLUG_PATTERN.test(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", "El taller asociado no es válido.", 422, { field: "providerSlug" });
  }
  return normalized;
}

function zoneStatus(value) {
  const normalized = String(value || "RESERVED").trim().toUpperCase();
  if (!STATUS_SET.has(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", "El estado de la zona no es válido.", 422, { field: "status" });
  }
  return normalized;
}

function serialize(row, key = row?.zone_key) {
  const meta = VILLAGE_ZONE_META[key] ?? { label: key, family: "HOUSE" };
  return {
    zoneKey: key,
    label: meta.label,
    family: meta.family,
    workshopType: row?.workshop_type ?? "",
    displayLabel: row?.display_label ?? "",
    providerSlug: row?.provider_slug ?? null,
    status: row?.status ?? "RESERVED",
    configured: Boolean(row),
    updatedAt: row?.updated_at ?? null
  };
}

async function audit(transaction, context, row, action, metadata = {}) {
  await transaction.query(
    `INSERT INTO audit_events (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, NULL, $2, 'site_village_zone', $3, $4::jsonb)`,
    [context.userId, action, row.id, JSON.stringify({ zoneKey: row.zone_key, ...metadata })]
  );
}

export function createVillageZonesService({ database } = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createVillageZonesService necesita una base de datos.");
  }

  return Object.freeze({
    async listAdmin(rawContext) {
      const context = adminContext(rawContext);
      const rows = await database.withContext(context, async (transaction) => {
        const result = await transaction.query("SELECT * FROM site_village_zones ORDER BY zone_key");
        return result.rows;
      });
      const byKey = new Map(rows.map((row) => [row.zone_key, row]));
      return VILLAGE_ZONE_KEYS.map((key) => serialize(byKey.get(key), key));
    },

    async listPublic() {
      const rows = await database.withContext(PUBLIC_CONTEXT, async (transaction) => {
        const result = await transaction.query(
          "SELECT * FROM site_village_zones WHERE status <> 'HIDDEN' ORDER BY zone_key"
        );
        return result.rows;
      });
      return rows.map((row) => serialize(row));
    },

    async save(rawContext, rawZoneKey, values = {}) {
      const context = adminContext(rawContext);
      const selectedZone = zoneKey(rawZoneKey);
      const selectedType = cleanText(values.workshopType, "workshopType", 80);
      const selectedLabel = cleanText(values.displayLabel, "displayLabel", 120);
      const selectedProvider = providerSlug(values.providerSlug);
      const selectedStatus = zoneStatus(values.status);

      try {
        return await database.withContext(context, async (transaction) => {
          const result = await transaction.query(
            `INSERT INTO site_village_zones (
               zone_key, workshop_type, display_label, provider_slug, status, updated_by
             ) VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (zone_key) DO UPDATE SET
               workshop_type = EXCLUDED.workshop_type,
               display_label = EXCLUDED.display_label,
               provider_slug = EXCLUDED.provider_slug,
               status = EXCLUDED.status,
               updated_by = EXCLUDED.updated_by
             RETURNING *`,
            [selectedZone, selectedType, selectedLabel, selectedProvider, selectedStatus, context.userId]
          );
          await audit(transaction, context, result.rows[0], "VILLAGE_ZONE_CONFIGURED", {
            workshopType: selectedType,
            providerSlug: selectedProvider,
            status: selectedStatus
          });
          return serialize(result.rows[0]);
        });
      } catch (error) {
        if (error?.code === "23505" && String(error?.constraint || "").includes("provider_slug")) {
          throw new ServiceError(
            "VILLAGE_PROVIDER_ALREADY_ASSIGNED",
            "Ese taller ya está asociado a otra zona del Pueblo Atelier.",
            409,
            { field: "providerSlug" }
          );
        }
        throw error;
      }
    },

    async reset(rawContext, rawZoneKey) {
      const context = adminContext(rawContext);
      const selectedZone = zoneKey(rawZoneKey);
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          "DELETE FROM site_village_zones WHERE zone_key = $1 RETURNING *",
          [selectedZone]
        );
        if (result.rowCount === 0) return { zoneKey: selectedZone, reset: false };
        await audit(transaction, context, result.rows[0], "VILLAGE_ZONE_RESET");
        return { zoneKey: selectedZone, reset: true };
      });
    }
  });
}
