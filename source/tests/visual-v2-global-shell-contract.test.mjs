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

  assert.match(premium, /visual-v2-global-shell\.css/);
  assert.match(premium, /PRIMARY_PUBLIC_NAVIGATION/);

  for (const route of ["/tienda/", "/talleres/", "/blog/", "/unete/", "/proveedor/acceso/"]) {
    assert.ok(premium.includes(`\"${route}\"`) || premium.includes(`"${route}"`), `falta la ruta pública ${route}`);
  }

  assert.match(premium, /if \(\["home", "commerce", "editorial"\]\.includes\(page\)\) return true/);
  assert.match(premium, /path\.startsWith\("\/talleres\/"\) \|\| path\.startsWith\("\/unete\/"\)/);
  assert.doesNotMatch(premium, /PRIMARY_PUBLIC_NAVIGATION[\s\S]*?\/admin\//);
  assert.doesNotMatch(premium, /PRIMARY_PUBLIC_NAVIGATION[\s\S]*?\/entrada\/webgl\//);

  assert.match(premium, /existingCart\?\.querySelector\("#cart-count"\)/);
  assert.match(premium, /data-public-navigation/);
  assert.match(premium, /data-public-menu-toggle/);
  assert.match(premium, /atelier-logo-official-dark\.svg/);

  assert.match(globalShell, /\.atelier-global-header/);
  assert.match(globalShell, /\.atelier-global-nav/);
  assert.match(globalShell, /\.atelier-global-cart/);
  assert.match(globalShell, /@media \(min-width: 761px\) and \(max-width: 1024px\)/);
  assert.match(globalShell, /@media \(max-width: 760px\)/);
  assert.match(globalShell, /prefers-reduced-motion:\s*reduce/);
});
