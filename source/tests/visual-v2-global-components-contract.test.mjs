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

test("FASE A2 normaliza tipografía, acciones y footer solo en la experiencia pública WEB V2", async () => {
  const premium = await text("premium-ui.js");
  const components = await text("visual-v2-global-components.css");

  assert.match(premium, /visual-v2-global-components\.css/);
  assert.match(premium, /function initializePublicActions\(\)/);
  assert.match(premium, /function initializePublicFooter\(\)/);
  assert.match(premium, /if \(!isPrimaryPublicExperience\(\)\) return;/);
  assert.match(premium, /initializePublicIdentity\(\);\s*initializePublicActions\(\);\s*initializePublicFooter\(\);/);

  const footerStart = premium.indexOf("const GLOBAL_FOOTER_LINKS");
  const footerEnd = premium.indexOf("]);", footerStart);
  assert.ok(footerStart >= 0 && footerEnd > footerStart, "no se pudo aislar el bloque del footer público");
  const footerBlock = premium.slice(footerStart, footerEnd + 3);
  for (const route of ["/tienda/", "/talleres/", "/blog/", "/unete/", "/proveedor/acceso/"]) {
    assert.ok(footerBlock.includes(`"${route}"`), `falta ${route} en el footer global`);
  }
  assert.doesNotMatch(footerBlock, /\/admin\//);
  assert.doesNotMatch(footerBlock, /\/entrada\/webgl\//);
  assert.doesNotMatch(footerBlock, /\/pueblo\//);

  assert.match(premium, /atelier-logo-official-light\.svg/);
  assert.match(premium, /Legal y privacidad/);
  assert.match(premium, /existingFooter[\s\S]*?body > footer, body > \.shell > footer/);
  assert.match(premium, /footer\.replaceChildren\(brand, navigation, meta\)/);
  assert.match(premium, /footer\.parentElement !== document\.body/);

  for (const selector of [
    "#home-hero .button-primary",
    ".workshops-closing .button.primary",
    "#add-cart-button.button.primary",
    "#checkout-button.button.primary",
    ".application-card .submit-button"
  ]) {
    assert.ok(premium.includes(`"${selector}"`), `falta CTA principal ${selector}`);
  }

  assert.match(components, /html\[data-atelier-public-shell="v2"\] body/);
  assert.match(components, /--v2-font-display/);
  assert.match(components, /\.atelier-action-primary/);
  assert.match(components, /\.atelier-action-secondary/);
  assert.match(components, /\.atelier-action-link/);
  assert.match(components, /\.atelier-global-footer/);
  assert.match(components, /\.atelier-global-footer-logo/);
  assert.match(components, /@media \(max-width: 1024px\)/);
  assert.match(components, /@media \(max-width: 700px\)/);
  assert.match(components, /prefers-reduced-motion:\s*reduce/);
});
