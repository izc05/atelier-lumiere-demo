import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, '..', 'public');

const read = (...parts) => readFile(join(PUBLIC, ...parts), 'utf8');

const PUBLIC_PAGES = Object.freeze([
  ['Home', 'index.html'],
  ['Tienda', 'tienda', 'index.html'],
  ['Producto', 'tienda', 'articulo', 'index.html'],
  ['Talleres', 'talleres', 'index.html'],
  ['Taller', 'taller', 'index.html'],
  ['Historias', 'blog', 'index.html'],
  ['Únete', 'unete', 'index.html'],
  ['Carrito', 'carrito', 'index.html']
]);

test('WEB V2 A2 cubre las ocho superficies públicas principales', async () => {
  for (const [label, ...parts] of PUBLIC_PAGES) {
    const html = await read(...parts);
    assert.match(html, /\/public-shell\.js/, `${label} debe conservar public-shell`);
    assert.match(html, /\/premium-ui\.js/, `${label} debe cargar premium-ui`);
    assert.match(html, /data-public-header/, `${label} debe conservar la cabecera pública`);
    assert.match(html, /data-public-navigation/, `${label} debe conservar la navegación pública`);
    assert.match(html, /id="main-content"/, `${label} debe conservar el destino del skip-link`);
  }
});

test('premium-ui conecta A1 + A2 sin extenderlos a superficies privadas', async () => {
  const premium = await read('premium-ui.js');

  assert.match(premium, /visual-v2-global-shell\.css/);
  assert.match(premium, /visual-v2-global-components\.css/);
  assert.match(premium, /dataset\.atelierPublicShell = "v2"/);
  assert.match(premium, /initializePublicIdentity\(\)/);
  assert.match(premium, /initializePublicActions\(\)/);
  assert.match(premium, /initializePublicFooter\(\)/);

  assert.match(premium, /page\.startsWith\("\/admin\/"\)|path\.startsWith\("\/admin\/"\)/);
  assert.match(premium, /provider-private/);
  assert.match(premium, /customer/);
  assert.match(premium, /legal/);
  assert.doesNotMatch(premium, /path\.startsWith\("\/entrada\/"\).*return true/);
});

test('A2 define jerarquía de acciones y footer editorial compartido', async () => {
  const premium = await read('premium-ui.js');
  const css = await read('visual-v2-global-components.css');

  assert.match(premium, /PRIMARY_ACTION_SELECTORS/);
  assert.match(premium, /SECONDARY_ACTION_SELECTORS/);
  assert.match(premium, /LINK_ACTION_SELECTORS/);
  assert.match(premium, /atelier-action-primary/);
  assert.match(premium, /atelier-action-secondary/);
  assert.match(premium, /atelier-action-link/);
  assert.match(premium, /atelier-global-footer/);
  assert.match(premium, /atelier-logo-official-light\.svg/);
  assert.match(premium, /Legal y privacidad/);

  assert.match(css, /\.atelier-action-primary/);
  assert.match(css, /\.atelier-action-secondary/);
  assert.match(css, /\.atelier-action-link/);
  assert.match(css, /\.atelier-global-footer/);
  assert.match(css, /linear-gradient\(145deg, var\(--v2-wine-950\)/);
  assert.match(css, /content:\s*"AL"/);
  assert.match(css, /@media \(max-width: 1024px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('A2 conserva navegación, carrito y footer como capas separadas de la lógica de negocio', async () => {
  const premium = await read('premium-ui.js');

  assert.match(premium, /PRIMARY_PUBLIC_NAVIGATION/);
  assert.match(premium, /existingCart/);
  assert.match(premium, /#cart-count/);
  assert.match(premium, /GLOBAL_FOOTER_LINKS/);
  assert.doesNotMatch(premium, /fetch\(/);
  assert.doesNotMatch(premium, /\/api\//);
});

test('los módulos compartidos de WEB V2 compilan', () => {
  execFileSync(process.execPath, ['--check', join(PUBLIC, 'premium-ui.js')], { stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', join(PUBLIC, 'public-shell.js')], { stdio: 'pipe' });
});
