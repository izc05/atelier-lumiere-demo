import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const publicRoot = new URL("../apps/web/public/", import.meta.url);

async function collectHtml(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory.pathname ?? directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectHtml(path));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

const paths = {
  css: new URL("../apps/web/public/premium-ui.css", import.meta.url),
  browser: new URL("../apps/web/public/premium-ui.js", import.meta.url),
  prepare: new URL("../apps/web/scripts/prepare-premium-ui.mjs", import.meta.url),
  original: new URL("../apps/web/scripts/prepare-original-home.mjs", import.meta.url),
  dockerfile: new URL("../infra/docker/Dockerfile.web", import.meta.url)
};

const [css, browser, prepare, original, dockerfile] = await Promise.all([
  readFile(paths.css, "utf8"),
  readFile(paths.browser, "utf8"),
  readFile(paths.prepare, "utf8"),
  readFile(paths.original, "utf8"),
  readFile(paths.dockerfile, "utf8")
]);

for (const file of [paths.browser, paths.prepare, paths.original]) {
  const result = spawnSync(process.execPath, ["--check", file.pathname], { encoding: "utf8" });
  assert.equal(result.status, 0, `${file.pathname} no supera node --check:\n${result.stderr || result.stdout}`);
}

const htmlFiles = await collectHtml(publicRoot.pathname);
assert.ok(htmlFiles.length >= 45, `Se esperaban al menos 45 páginas HTML y se encontraron ${htmlFiles.length}.`);

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  assert.equal((html.match(/href="\/premium-ui\.css"/g) ?? []).length, 1, `${file} debe cargar premium-ui.css una sola vez.`);
  assert.equal((html.match(/src="\/premium-ui\.js"/g) ?? []).length, 1, `${file} debe cargar premium-ui.js una sola vez.`);
}

for (const expected of [
  "--atelier-wine-950",
  ".atelier-opening",
  ".atelier-progress",
  ".atelier-pointer-aura",
  "data-atelier-page=\"commerce\"",
  "data-atelier-page=\"admin\"",
  "data-atelier-page=\"customer\"",
  "body.original-home-static",
  "prefers-reduced-motion: reduce",
  "forced-colors: active"
]) {
  assert.ok(css.includes(expected), `Falta una capacidad visual o accesible: ${expected}`);
}

for (const expected of [
  "atelierRoot.dataset.atelierPage",
  "atelierRoot.dataset.motion",
  "atelier-lumiere-opening-seen",
  "window.sessionStorage",
  "initializeOpening",
  "initializePremiumReveals",
  "IntersectionObserver",
  "prefers-reduced-motion",
  "pointer: fine"
]) {
  assert.ok(browser.includes(expected), `Falta una capacidad del sistema visual: ${expected}`);
}

for (const forbidden of [
  "innerHTML",
  "document.cookie",
  "localStorage",
  "Authorization",
  "Bearer ",
  "eval(",
  "new Function",
  "http://",
  "https://"
]) {
  assert.equal(browser.includes(forbidden), false, `premium-ui.js no debe contener: ${forbidden}`);
}
assert.doesNotMatch(css, /url\(["']?https?:\/\//, "El sistema visual no debe cargar recursos remotos.");

for (const expected of [
  "injectPremiumAssets",
  "preparePremiumUi",
  "href=\"/premium-ui.css\"",
  "src=\"/premium-ui.js\""
]) {
  assert.ok(prepare.includes(expected), `Falta una protección del generador premium: ${expected}`);
}

assert.ok(original.includes('href="/premium-ui.css"'), "La utilidad de demo debe seguir cargando premium-ui.css si se usa manualmente.");
assert.ok(original.includes('src="/premium-ui.js"'), "La utilidad de demo debe seguir cargando premium-ui.js si se usa manualmente.");

const premiumIndex = dockerfile.indexOf("prepare-premium-ui.mjs");
assert.ok(premiumIndex >= 0, "Docker debe aplicar el sistema visual premium a la aplicación real.");
assert.equal(
  dockerfile.includes("prepare-original-home.mjs"),
  false,
  "Docker de producción no debe sobrescribir la HOME real con la demo antigua."
);
assert.equal(
  dockerfile.includes("COPY index.html /demo/index.html"),
  false,
  "Docker de producción no debe copiar el index de la demo antigua."
);
assert.match(
  dockerfile,
  /COPY\s+source\/apps\/web\s+\.\/apps\/web/,
  "Docker debe construir la web desde source/apps/web."
);

const [cssStat, jsStat] = await Promise.all([stat(paths.css), stat(paths.browser)]);
assert.ok(cssStat.size < 40_000, `premium-ui.css es demasiado pesado: ${cssStat.size} bytes.`);
assert.ok(jsStat.size < 20_000, `premium-ui.js es demasiado pesado: ${jsStat.size} bytes.`);

console.log(`Sistema visual premium validado en ${htmlFiles.length} páginas sin recursos remotos ni credenciales.`);
