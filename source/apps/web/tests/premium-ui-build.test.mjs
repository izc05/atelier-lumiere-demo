import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { injectPremiumAssets, preparePremiumUi } from "../scripts/prepare-premium-ui.mjs";

test("inyecta el sistema visual premium una sola vez", () => {
  const source = "<!doctype html><html><head><title>Prueba</title></head><body></body></html>";
  const first = injectPremiumAssets(source);
  const second = injectPremiumAssets(first);

  assert.match(first, /href="\/premium-ui\.css"/);
  assert.match(first, /src="\/premium-ui\.js"/);
  assert.equal(second, first);
  assert.equal((second.match(/premium-ui\.css/g) ?? []).length, 1);
  assert.equal((second.match(/premium-ui\.js/g) ?? []).length, 1);
});

test("aplica la capa premium de forma recursiva", async () => {
  const root = await mkdtemp(join(tmpdir(), "atelier-premium-ui-"));
  try {
    await mkdir(join(root, "tienda"), { recursive: true });
    await writeFile(join(root, "index.html"), "<html><head></head><body>Inicio</body></html>", "utf8");
    await writeFile(join(root, "tienda", "index.html"), "<html><head></head><body>Tienda</body></html>", "utf8");

    assert.equal(await preparePremiumUi(root), 2);
    for (const file of [join(root, "index.html"), join(root, "tienda", "index.html")]) {
      const html = await readFile(file, "utf8");
      assert.match(html, /href="\/premium-ui\.css"/);
      assert.match(html, /src="\/premium-ui\.js"/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
