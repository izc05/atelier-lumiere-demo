import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareOriginalHome } from "../scripts/prepare-original-home.mjs";

test("prepara la portada original sin sustituir las rutas reales", async () => {
  const root = await mkdtemp(join(tmpdir(), "atelier-original-home-"));
  const demo = join(root, "demo");
  const output = join(root, "public");

  try {
    await Promise.all([
      mkdir(join(demo, "_next", "static"), { recursive: true }),
      mkdir(join(demo, "images"), { recursive: true }),
      mkdir(join(demo, "assets"), { recursive: true }),
      mkdir(output, { recursive: true })
    ]);

    await writeFile(
      join(demo, "index.html"),
      '<!doctype html><html><head>'
        + '<script src="/atelier-lumiere-demo/_next/app.js"></script>'
        + '</head><body><div hidden=""><!--$--><!--/$--></div>'
        + '<h1 style="opacity:0;transform:translateY(28px)">Cada pieza guarda un instante</h1>'
        + '<img src="/atelier-lumiere-demo/images/hero-hilo-celebracion.webp">'
        + '<a href="/atelier-lumiere-demo/tienda/">Tienda</a>'
        + '<button class="button button-outline">Pedir un diseño propio</button>'
        + '</body></html>',
      "utf8"
    );
    await writeFile(join(demo, "_next", "static", "style.css"), "body{}", "utf8");
    await writeFile(join(demo, "images", "hero-hilo-celebracion.webp"), "image", "utf8");
    await writeFile(join(demo, "assets", "brand.css"), ":root{}", "utf8");

    await prepareOriginalHome({ demoDirectory: demo, publicDirectory: output });

    const html = await readFile(join(output, "index.html"), "utf8");
    assert.match(html, /class="original-home-static"/);
    assert.match(html, /href="\/tienda\/"/);
    assert.match(html, /src="\/images\/hero-hilo-celebracion\.webp"/);
    assert.match(html, /href="\/original-home-overrides\.css"/);
    assert.match(html, /src="\/original-home\.js"/);
    assert.match(html, /<a class="button button-outline" href="\/tienda\/">/);
    assert.doesNotMatch(html, /atelier-lumiere-demo/);
    assert.doesNotMatch(html, /_next\/app\.js/);

    assert.equal(
      await readFile(join(output, "_next", "static", "style.css"), "utf8"),
      "body{}"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
