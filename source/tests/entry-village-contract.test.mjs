import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "apps", "web", "public");
const SESSION_KEY = "atelier_brand_entry_seen";

async function text(...parts) {
  return readFile(join(PUBLIC, ...parts), "utf8");
}

function runBrandEntry(script, { search = "", referrer = "", seen = false } = {}) {
  const storage = new Map(seen ? [[SESSION_KEY, "1"]] : []);
  const redirects = [];
  const entry = {
    hidden: false,
    style: { setProperty() {} },
    addEventListener() {}
  };

  const location = {
    origin: "https://atelier.example",
    pathname: "/",
    search,
    href: "https://atelier.example/" + search,
    replace(value) { redirects.push(["replace", value]); }
  };

  const context = {
    URL,
    URLSearchParams,
    Math,
    window: {
      location,
      innerWidth: 1440,
      innerHeight: 900
    },
    document: {
      referrer,
      getElementById(id) { return id === "brand-entry" ? entry : null; }
    },
    sessionStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, String(value)); }
    }
  };

  vm.runInNewContext(script, context, { filename: "brand-entry.js" });
  return { redirects, storage, entry };
}

test("una visita nueva y directa a Home entra por Pueblo Atelier", async () => {
  const script = await text("brand-entry.js");
  const result = runBrandEntry(script);
  assert.deepEqual(result.redirects, [["replace", "/entrada/"]]);
  assert.equal(result.entry.hidden, true);
});

test("intro=0 salta el Pueblo, marca la sesión y no redirige", async () => {
  const script = await text("brand-entry.js");
  const result = runBrandEntry(script, { search: "?intro=0" });
  assert.deepEqual(result.redirects, []);
  assert.equal(result.storage.get(SESSION_KEY), "1");
});

test("una sesión que ya vio la entrada abre Home directamente", async () => {
  const script = await text("brand-entry.js");
  const result = runBrandEntry(script, { seen: true });
  assert.deepEqual(result.redirects, []);
});

test("volver a Home desde una ruta interna no crea un bucle con el Pueblo", async () => {
  const script = await text("brand-entry.js");
  const result = runBrandEntry(script, { referrer: "https://atelier.example/entrada/" });
  assert.deepEqual(result.redirects, []);
  assert.equal(result.storage.get(SESSION_KEY), "1");
});

test("intro=1 fuerza el Pueblo incluso desde una ruta interna", async () => {
  const script = await text("brand-entry.js");
  const result = runBrandEntry(script, {
    search: "?intro=1",
    referrer: "https://atelier.example/talleres/",
    seen: true
  });
  assert.deepEqual(result.redirects, [["replace", "/entrada/"]]);
});

test("el Pueblo ofrece salida explícita, fallback en lista y acabado responsive", async () => {
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
