import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "apps", "web", "public");

async function text(...parts) {
  return readFile(join(PUBLIC, ...parts), "utf8");
}

test("FASE A1 comparte cabecera y navegación en la WEB V2 sin entrar en áreas privadas", async () => {
  const premium = await text("premium-ui.js");
  const globalShell = await text("visual-v2-global-shell.css");
  const publicShell = await text("public-shell.css");

  assert.match(premium, /visual-v2-global-shell\.css/);
  assert.match(premium, /PRIMARY_PUBLIC_NAVIGATION/);

  const navStart = premium.indexOf("const PRIMARY_PUBLIC_NAVIGATION");
  const navEnd = premium.indexOf("]);", navStart);
  assert.ok(navStart >= 0 && navEnd > navStart, "no se pudo aislar el bloque de navegación pública");
  const navigationBlock = premium.slice(navStart, navEnd + 3);

  for (const route of ["/tienda/", "/talleres/", "/blog/", "/unete/", "/proveedor/acceso/"]) {
    assert.ok(navigationBlock.includes(`"${route}"`), `falta la ruta pública ${route}`);
  }

  assert.doesNotMatch(navigationBlock, /\/admin\//);
  assert.doesNotMatch(navigationBlock, /\/entrada\/webgl\//);
  assert.doesNotMatch(navigationBlock, /\/pueblo\//);

  assert.match(premium, /if \(\["home", "commerce", "editorial"\]\.includes\(page\)\) return true/);
  assert.match(premium, /path\.startsWith\("\/talleres\/"\) \|\| path\.startsWith\("\/unete\/"\)/);
  assert.match(premium, /existingCart\?\.querySelector\("#cart-count"\)/);
  assert.match(premium, /data-public-navigation/);
  assert.match(premium, /data-public-menu-toggle/);
  assert.match(premium, /atelier-logo-official-dark\.svg/);

  assert.match(globalShell, /\.atelier-global-header/);
  assert.match(globalShell, /\.atelier-global-nav/);
  assert.match(globalShell, /\.atelier-global-cart/);
  assert.match(globalShell, /topbar\.atelier-global-header/);
  assert.match(globalShell, /@media \(min-width: 761px\) and \(max-width: 1024px\)/);
  assert.match(globalShell, /@media \(max-width: 760px\)/);
  assert.match(globalShell, /\.atelier-global-cart \.atelier-global-cart-label\s*\{[\s\S]*?display:\s*inline\s*!important;/);
  assert.match(globalShell, /body\.public-menu-open \.atelier-global-header\s*\{[\s\S]*?position:\s*static\s*!important;[\s\S]*?backdrop-filter:\s*none\s*!important;/);
  assert.match(globalShell, /body\.public-menu-open \.atelier-global-nav a,[\s\S]*?color:\s*var\(--v2-ivory-50\)\s*!important;[\s\S]*?font-family:\s*var\(--v2-font-display\)\s*!important;/);
  assert.match(globalShell, /prefers-reduced-motion:\s*reduce/);

  // La lógica móvil probada sigue siendo la fuente autoritativa: hidden al cerrar y overlay fijo al abrir.
  assert.match(publicShell, /\.js \[data-public-navigation\]\s*\{[\s\S]*?position:\s*fixed\s*!important;[\s\S]*?display:\s*flex\s*!important;/);
  assert.match(publicShell, /\.js \[data-public-navigation\]\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important;/);
  assert.match(publicShell, /\.js body\.public-menu-open \[data-public-navigation\]/);
});
