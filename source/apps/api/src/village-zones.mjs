export const VILLAGE_ZONE_KEYS = Object.freeze([
  "ZONE_01", "ZONE_02", "ZONE_03", "ZONE_04", "ZONE_05", "ZONE_06", "ZONE_07",
  "ZONE_08", "ZONE_09", "ZONE_10", "ZONE_11", "ZONE_12", "ZONE_13", "ZONE_14"
]);

export const VILLAGE_ZONE_SET = new Set(VILLAGE_ZONE_KEYS);

export const VILLAGE_ZONE_META = Object.freeze({
  ZONE_01: { label: "Zona 01 · Pabellón oeste", family: "SIGNATURE" },
  ZONE_02: { label: "Zona 02 · Estudio este", family: "SIGNATURE" },
  ZONE_03: { label: "Zona 03 · Barrio sur", family: "HOUSE" },
  ZONE_04: { label: "Zona 04 · Barrio sur", family: "HOUSE" },
  ZONE_05: { label: "Zona 05 · Barrio sur", family: "HOUSE" },
  ZONE_06: { label: "Zona 06 · Camino este", family: "HOUSE" },
  ZONE_07: { label: "Zona 07 · Barrio oeste", family: "HOUSE" },
  ZONE_08: { label: "Zona 08 · Barrio norte", family: "HOUSE" },
  ZONE_09: { label: "Zona 09 · Barrio norte", family: "HOUSE" },
  ZONE_10: { label: "Zona 10 · Camino este", family: "HOUSE" },
  ZONE_11: { label: "Zona 11 · Ladera noroeste", family: "HOUSE" },
  ZONE_12: { label: "Zona 12 · Ladera norte", family: "HOUSE" },
  ZONE_13: { label: "Zona 13 · Ladera noreste", family: "HOUSE" },
  ZONE_14: { label: "Zona 14 · Mirador este", family: "HOUSE" }
});
