import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "apps", "web", "public");
const ROOT = join(HERE, "..", "..", "..", "tools", "preview-local");

async function text(...parts) {
  return readFile(join(PUBLIC, ...parts), "utf8");
}

async function previewText(file) {
  return readFile(join(ROOT, file), "utf8");
}

test("la Home contiene una entrada cinematográfica que conduce al Pueblo WebGL", async () => {
  const script = await text("brand-entry.js");
  const css = await text("visual-unified-entry.css");
  const responsive = await text("visual-unified-entry-responsive.css");

  assert.match(script, /const VILLAGE_URL = "\/entrada\/webgl\/"/);
  assert.match(script, /window\.location\.assign\(VILLAGE_URL\)/);
  assert.match(script, /brand-entry--cinematic/);
  assert.match(script, /visual-unified-entry-responsive\.css/);
  assert.match(script, /Artesanía para momentos que permanecen/);
  assert.match(script, /Ir directamente a la web/);
  assert.match(css, /brand-entry--cinematic/);
  assert.match(css, /max-width:\s*980px/);
  assert.match(css, /max-width:\s*640px/);
  assert.match(responsive, /max-height:\s*720px/);
  assert.match(responsive, /max-height:\s*680px/);
  assert.match(responsive, /safe-area-inset/);
  assert.match(responsive, /prefers-reduced-motion:\s*reduce/);
});

test("la entrada conserva sesión, forzado, retorno interno y marca de llegada", async () => {
  const script = await text("brand-entry.js");

  assert.match(script, /atelier_brand_entry_seen/);
  assert.match(script, /atelier_arrival_from_entry/);
  assert.match(script, /params\.get\("intro"\) === "1"/);
  assert.match(script, /params\.get\("intro"\) === "0"/);
  assert.match(script, /cameFromInternalPage/);
  assert.match(script, /markArrival\(\)/);
  assert.match(script, /referrer\.origin === window\.location\.origin/);
});

test("el Pueblo ligero mantiene salida explícita, talleres dinámicos y modo responsive", async () => {
  const html = await text("entrada", "index.html");
  const village = await text("entrada", "village.js");
  const workshops = await text("entrada", "village-workshops.js");
  const workshopCss = await text("entrada", "village-workshops.css");
  const premiumCss = await text("entrada", "village-premium.css");

  assert.match(html, /class="village-skip-entry" href="\/\?intro=0"/);
  assert.match(html, /href="\/\?intro=0" aria-label="Saltar la introducción/);
  assert.match(village, /Ver talleres en lista/);
  assert.match(village, /prefers-reduced-motion/);
  assert.match(village, /data-village-mode/);
  assert.match(workshops, /\/taller\/\?slug=/);
  assert.match(workshops, /VILLAGE_DYNAMIC_PARCELS/);
  assert.match(workshopCss, /village-premium\.css/);
  assert.match(premiumCss, /max-width:\s*760px/);
  assert.match(premiumCss, /data-village-mode="lite"/);
});

test("el WebGL conserva fallback, capas cinematográficas y llegada desde la entrada", async () => {
  const html = await text("entrada", "webgl", "index.html");
  const bootstrap = await text("entrada", "webgl", "bootstrap.js");
  const arrival = await text("entrada", "webgl", "arrival-transition.js");
  const arrivalCss = await text("entrada", "webgl", "arrival-transition.css");

  assert.match(html, /premium-ui\.css/);
  assert.match(html, /arrival-transition\.css/);
  assert.match(html, /Atelier Lumière · Pueblo interactivo/);
  assert.match(bootstrap, /WebGL2|webgl2/i);
  assert.match(bootstrap, /scene\.js/);
  assert.match(bootstrap, /distant-depth\.js/);
  assert.match(bootstrap, /world-signage\.js/);
  assert.match(bootstrap, /arrival-transition\.js/);
  assert.match(arrival, /atelier_arrival_from_entry/);
  assert.match(arrival, /data.*arrival|dataset\.arrival/);
  assert.match(arrivalCss, /prefers-reduced-motion:\s*reduce/);
});

test("la preview completa arranca desde la entrada cinematográfica", async () => {
  const server = await previewText("preview-server.cjs");
  const readme = await previewText("LEEME_PRIMERO.txt");

  assert.match(server, /\?intro=1/);
  assert.match(server, /Entrada cinematográfica → Pueblo WebGL → Visual V2/);
  assert.match(readme, /ENTRADA CINEMATOGRÁFICA/);
  assert.match(readme, /\?intro=1/);
  assert.match(readme, /390 px/);
});
