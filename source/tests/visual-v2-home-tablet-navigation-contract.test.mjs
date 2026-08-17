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

test("Home mantiene navegación visible entre escritorio y overlay móvil", async () => {
  const html = await text("index.html");
  const legacy = await text("styles.css");
  const header = await text("visual-v2-home-header.css");
  const responsive = await text("visual-v2-home-responsive.css");
  const shell = await text("public-shell.css");

  assert.match(html, /class="main-nav public-navigation"/);
  assert.match(html, /data-public-menu-toggle/);

  // La base heredada oculta la navegación hasta 1080 px.
  assert.match(legacy, /@media \(max-width: 1080px\)[\s\S]*?\.main-nav \{ display: none; \}/);

  // V2 debe recuperarla expresamente en tablet para no dejar 761–1024 sin navegación.
  assert.match(header, /@media \(min-width: 761px\) and \(max-width: 1024px\)[\s\S]*?\.site-header \.main-nav\s*\{[\s\S]*?display:\s*flex\s*!important;/);
  assert.match(responsive, /@media \(min-width: 761px\) and \(max-width: 1024px\)/);
  assert.match(responsive, /"brand actions"\s*\n\s*"nav nav"/);

  // Por debajo, el shell común toma el relevo mediante el menú overlay.
  assert.match(shell, /@media \(max-width: 760px\)/);
  assert.match(shell, /\.js \.public-menu-toggle\s*\{[\s\S]*?display:\s*inline-flex/);
});
