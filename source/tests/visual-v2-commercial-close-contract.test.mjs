import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..");
const PUBLIC = join(SOURCE, "apps", "web", "public");
const text = (...parts) => readFile(join(PUBLIC, ...parts), "utf8");

test("D2 ofrece recuperación privada sin revelar si existe el pedido", async () => {
  const html = await text("pedido", "acceso", "index.html");
  const access = await text("pedido", "acceso", "access.js");

  assert.match(html, /id="access-recovery-form"/);
  assert.match(html, /id="recovery-email" type="email"/);
  assert.match(html, /id="recovery-order"/);
  assert.match(html, /Por seguridad, la respuesta será la misma/);
  assert.match(access, /\/internal\/customer\/access\/request/);
  assert.match(access, /Si los datos corresponden a un pedido, enviaremos un nuevo enlace privado/);
  assert.match(access, /new URLSearchParams\(raw\)\.get\("token"\)/);
  assert.match(access, /window\.history\.replaceState\(null, "", window\.location\.pathname\)/);
  assert.doesNotMatch(access, /pedido encontrado|correo encontrado|no existe el pedido|no existe el correo/i);
});

test("D2 distingue catálogo realmente vacío de cero coincidencias", async () => {
  const html = await text("tienda", "index.html");
  const store = await text("tienda", "store.js");

  assert.match(html, /id="empty-title"/);
  assert.match(html, /id="empty-message"/);
  assert.match(html, /id="clear-filters-button"[^>]*hidden>Limpiar filtros/);
  assert.match(store, /function activeFilters\(\)/);
  assert.match(store, /No hay piezas que coincidan con tu búsqueda/);
  assert.match(store, /El catálogo todavía está vacío/);
  assert.match(store, /byId\("clear-filters-button"\)\.addEventListener\("click"/);
  assert.match(store, /void load\(\{ refreshCategories: true \}\)/);
});

test("D2 no altera la lógica sensible de Producto, Carrito ni checkout del navegador", async () => {
  const product = await text("tienda", "product.js");
  const cart = await text("carrito", "cart.js");

  assert.match(product, /window\.AtelierCart\.add\(/);
  assert.match(product, /selectedPersonalization\(\)/);
  assert.match(cart, /cart\.updateQuantity\(/);
  assert.match(cart, /fetch\("\/internal\/checkout\/submit"/);
  assert.match(cart, /button\.textContent = "Registrar pedido sin pagar"/);
});

test("los scripts públicos y el servicio de recuperación D2 compilan", () => {
  execFileSync(process.execPath, ["--check", join(PUBLIC, "pedido", "acceso", "access.js")], { stdio: "pipe" });
  execFileSync(process.execPath, ["--check", join(PUBLIC, "tienda", "store.js")], { stdio: "pipe" });
  execFileSync(process.execPath, ["--check", join(SOURCE, "apps", "api", "src", "customer-access-recovery-service.mjs")], { stdio: "pipe" });
});
