import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "apps", "web", "public");
const text = (...parts) => readFile(join(PUBLIC, ...parts), "utf8");

test("D1 conecta Producto con el taller real sin consultas nuevas", async () => {
  const html = await text("tienda", "articulo", "index.html");
  const continuity = await text("visual-v2-commerce-continuity.js");
  const css = await text("visual-v2-commerce-continuity.css");

  assert.match(html, /visual-v2-commerce-continuity\.css/);
  assert.match(html, /visual-v2-commerce-continuity\.js/);
  assert.match(continuity, /new URLSearchParams\(window\.location\.search\)\.get\("taller"\)/);
  assert.match(continuity, /\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$/);
  assert.match(continuity, /link\.href = `\/taller\/\?slug=\$\{encodeURIComponent\(slug\)\}`/);
  assert.match(continuity, /link\.textContent = `Creado por \$\{name\} →`/);
  assert.match(continuity, /aria-label.*Conocer el taller/);
  assert.doesNotMatch(continuity, /\bfetch\s*\(/);
  assert.match(css, /\.product-provider-link:hover::after/);
  assert.match(css, /\.product-provider-link:focus-visible/);
});

test("D1 distingue carrito vacío y carrito activo sin tocar checkout", async () => {
  const html = await text("carrito", "index.html");
  const continuity = await text("visual-v2-commerce-continuity.js");
  const css = await text("visual-v2-commerce-continuity.css");

  assert.match(html, /visual-v2-commerce-continuity\.css/);
  assert.match(html, /visual-v2-commerce-continuity\.js/);
  assert.match(continuity, /const active = !cartContent\.hidden/);
  assert.match(continuity, /document\.body\.dataset\.cartMode = active \? "active" : "empty"/);
  assert.match(continuity, /attributeFilter: \["hidden"\]/);
  assert.match(css, /body\[data-cart-mode="active"\] #main-content > \.hero/);
  assert.match(css, /body\[data-cart-mode="active"\] #cart-content\.cart-layout/);
  assert.match(css, /body\[data-cart-mode="empty"\] #main-content > \.hero/);
  assert.doesNotMatch(continuity, /checkout\/submit|updateQuantity|estimatedUnitPrice|AtelierCart\.add|AtelierCart\.clear/);
});

test("D1 mantiene intacta la lógica funcional de Producto y Carrito", async () => {
  const product = await text("tienda", "product.js");
  const cart = await text("carrito", "cart.js");

  assert.match(product, /window\.AtelierCart\.add\(/);
  assert.match(product, /stockMode === "FINITE"/);
  assert.match(product, /selectedPersonalization\(\)/);
  assert.match(product, /selectedCustomRequest\(\)/);

  assert.match(cart, /cart\.updateQuantity\(/);
  assert.match(cart, /cart\.remove\(/);
  assert.match(cart, /fetch\("\/internal\/checkout\/submit"/);
  assert.match(cart, /checkoutPayload\(lines\)/);
  assert.match(cart, /cart\.clear\(\)/);
});

test("la capa JavaScript D1 compila", () => {
  execFileSync(process.execPath, ["--check", join(PUBLIC, "visual-v2-commerce-continuity.js")], { stdio: "pipe" });
});
