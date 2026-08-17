export const SHOWCASE_SLOTS = Object.freeze([
  "ENTRY_HERO_DESKTOP",
  "ENTRY_HERO_MOBILE",
  "HOME_HERO_DESKTOP",
  "HOME_HERO_MOBILE",
  "STORE_HERO_DESKTOP",
  "STORE_HERO_MOBILE",
  "WORKSHOPS_HERO_DESKTOP",
  "WORKSHOPS_HERO_MOBILE",
  "STORIES_HERO_DESKTOP",
  "STORIES_HERO_MOBILE",
  "COMMISSIONS_HERO_DESKTOP",
  "COMMISSIONS_HERO_MOBILE"
]);

export const SHOWCASE_SLOT_SET = new Set(SHOWCASE_SLOTS);

export const SHOWCASE_SLOT_META = Object.freeze({
  ENTRY_HERO_DESKTOP: { label: "Entrada cinematográfica · escritorio", page: "ENTRY", viewport: "DESKTOP" },
  ENTRY_HERO_MOBILE: { label: "Entrada cinematográfica · móvil", page: "ENTRY", viewport: "MOBILE" },
  HOME_HERO_DESKTOP: { label: "Home · Hero escritorio", page: "HOME", viewport: "DESKTOP" },
  HOME_HERO_MOBILE: { label: "Home · Hero móvil", page: "HOME", viewport: "MOBILE" },
  STORE_HERO_DESKTOP: { label: "Tienda · Hero escritorio", page: "STORE", viewport: "DESKTOP" },
  STORE_HERO_MOBILE: { label: "Tienda · Hero móvil", page: "STORE", viewport: "MOBILE" },
  WORKSHOPS_HERO_DESKTOP: { label: "Talleres · Hero escritorio", page: "WORKSHOPS", viewport: "DESKTOP" },
  WORKSHOPS_HERO_MOBILE: { label: "Talleres · Hero móvil", page: "WORKSHOPS", viewport: "MOBILE" },
  STORIES_HERO_DESKTOP: { label: "Historias · Hero escritorio", page: "STORIES", viewport: "DESKTOP" },
  STORIES_HERO_MOBILE: { label: "Historias · Hero móvil", page: "STORIES", viewport: "MOBILE" },
  COMMISSIONS_HERO_DESKTOP: { label: "Encargos · Hero escritorio", page: "COMMISSIONS", viewport: "DESKTOP" },
  COMMISSIONS_HERO_MOBILE: { label: "Encargos · Hero móvil", page: "COMMISSIONS", viewport: "MOBILE" }
});
