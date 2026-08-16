import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..");

async function text(...parts) {
  return readFile(join(SOURCE, ...parts), "utf8");
}

test("U2.4 registra los dos formatos editoriales de la entrada", async () => {
  const slots = await text("apps", "api", "src", "showcase-slots.mjs");
  const migration = await text("packages", "database", "migrations", "0056_showcase_entry_media.sql");

  for (const slot of ["ENTRY_HERO_DESKTOP", "ENTRY_HERO_MOBILE"]) {
    assert.ok(slots.includes(slot), `falta ${slot} en showcase-slots`);
    assert.ok(migration.includes(slot), `falta ${slot} en la migración incremental`);
  }
  assert.match(slots, /page:\s*"ENTRY"/);
  assert.match(migration, /site_showcase_media_slot_key_check/);
});

test("la entrada pública usa fotografía administrada y conserva fallback", async () => {
  const entry = await text("apps", "web", "public", "brand-entry.js");
  const mediaCss = await text("apps", "web", "public", "visual-unified-entry-media.css");

  assert.match(entry, /ENTRY_HERO_DESKTOP/);
  assert.match(entry, /ENTRY_HERO_MOBILE/);
  assert.match(entry, /fetch\("\/internal\/showcase"/);
  assert.match(entry, /media\.focalX/);
  assert.match(entry, /media\.focalY/);
  assert.match(entry, /visual-unified-entry-media\.css/);
  assert.match(entry, /removeEntryMedia/);
  assert.match(mediaCss, /brand-entry--has-media/);
  assert.match(mediaCss, /prefers-reduced-motion:\s*reduce/);
});

test("el Escaparate permite gestionar la entrada con ALT, foco y retirada", async () => {
  const admin = await text("apps", "web", "public", "admin", "escaparate", "index.html");
  const entryAdmin = await text("apps", "web", "public", "admin", "escaparate", "showcase-entry.js");

  assert.match(admin, /showcase-entry\.js/);
  assert.match(admin, /metric-total">12</);
  assert.match(admin, /metric-fallback">12</);
  assert.match(entryAdmin, /ENTRY_HERO_DESKTOP/);
  assert.match(entryAdmin, /ENTRY_HERO_MOBILE/);
  assert.match(entryAdmin, /X-Alt-Text/);
  assert.match(entryAdmin, /X-Focal-X/);
  assert.match(entryAdmin, /X-Focal-Y/);
  assert.match(entryAdmin, /method:\s*"DELETE"/);
  assert.match(entryAdmin, /Bordado cinematográfico activo/);
  assert.match(entryAdmin, /!target\.querySelector\("#showcase-entry-page"\)/);
});
