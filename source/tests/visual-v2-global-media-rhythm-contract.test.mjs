import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "apps", "web", "public");

async function text(file) {
  return readFile(join(PUBLIC, file), "utf8");
}

test("A3 mantiene tarjetas ligeras y fotografía coherente sin convertir todos los contenidos en la misma tarjeta", async () => {
  const tienda = await text("visual-v2-tienda.css");
  const talleres = await text("visual-v2-talleres.css");
  const blog = await text("visual-v2-blog.css");

  assert.match(tienda, /\.store-page \.product-card\s*\{[\s\S]*?border:\s*0\s*!important;[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important;/);
  assert.match(tienda, /\.store-page \.product-image\s*\{[\s\S]*?background:\s*var\(--v2-ivory-200\)\s*!important;/);
  assert.match(tienda, /saturate\(var\(--v2-image-saturation\)\)/);
  assert.match(tienda, /scale\(var\(--v2-image-hover-scale\)\)/);

  assert.match(talleres, /\.workshop-directory-card\s*\{[\s\S]*?border:\s*0\s*!important;[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important;/);
  assert.match(talleres, /\.workshop-directory-media\s*\{[\s\S]*?border-radius:\s*0\s*!important;[\s\S]*?background:\s*var\(--v2-ivory-200\)\s*!important;/);
  assert.match(talleres, /saturate\(var\(--v2-image-saturation\)\)/);
  assert.match(talleres, /scale\(var\(--v2-image-hover-scale\)\)/);

  assert.match(blog, /body #grid \.card\s*\{[\s\S]*?border:\s*0\s*!important;[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important;/);
  assert.match(blog, /body #grid \.cover\s*\{[\s\S]*?border-radius:\s*var\(--v2-radius-xs\)\s*!important;[\s\S]*?background:\s*var\(--v2-ivory-200\)\s*!important;/);
  assert.match(blog, /saturate\(var\(--v2-image-saturation\)\)/);
  assert.match(blog, /scale\(var\(--v2-image-hover-scale\)\)/);

  // Talleres conserva deliberadamente composición a sangre; Producto/Historia conservan un radio editorial mínimo.
  assert.match(tienda, /\.product-image[\s\S]*?border-radius:\s*var\(--v2-radius-xs\)/);
  assert.match(talleres, /\.workshop-directory-media[\s\S]*?border-radius:\s*0\s*!important/);
});

test("A3 conserva un único ritmo de movimiento editorial y reduced motion", async () => {
  const motion = await text("visual-v2-motion.css");
  const tokens = await text("visual-v2-tokens.css");

  assert.match(tokens, /--v2-image-saturation:\s*\.94/);
  assert.match(tokens, /--v2-image-hover-scale:\s*1\.025/);
  assert.match(tokens, /--v2-section-y:/);
  assert.match(tokens, /--v2-duration-slow:/);
  assert.match(tokens, /--v2-ease-emphasis:/);

  assert.match(motion, /transform:\s*translate3d\(0, 16px, 0\)\s*!important/);
  assert.match(motion, /transition-duration:\s*560ms\s*!important/);
  assert.match(motion, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(motion, /transition:\s*none\s*!important/);
  assert.match(motion, /transform:\s*none\s*!important/);
});
