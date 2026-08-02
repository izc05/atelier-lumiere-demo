import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../public/admin/proveedores/", import.meta.url);

test("la vista administrativa incluye el progreso completo de activación", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const script = await readFile(new URL("provider-status.js", root), "utf8");
  const css = await readFile(new URL("provider-status.css", root), "utf8");

  assert.match(html, /Estado de activación/);
  assert.match(html, /provider-status\.js/);
  assert.match(html, /provider-status\.css/);
  assert.match(script, /PENDING_APPROVAL/);
  assert.match(script, /provider\.onboarding/);
  assert.match(script, /\/internal\/admin\/providers/);
  assert.match(css, /\.activation-step\.done/);
  assert.match(css, /@media \(max-width: 720px\)/);

  for (const forbidden of [
    "SMTP_PASSWORD",
    "DEV_ADMIN_TOKEN",
    "Authorization",
    "document.cookie",
    "localStorage",
    "innerHTML"
  ]) {
    assert.equal(script.includes(forbidden), false);
  }
});
