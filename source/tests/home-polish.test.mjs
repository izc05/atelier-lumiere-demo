import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { injectHomePolish } from "../apps/web/scripts/prepare-home-polish.mjs";

const dockerfile = await readFile(new URL("../infra/docker/Dockerfile.web", import.meta.url), "utf8");
const polish = await readFile(new URL("../apps/web/public/home-polish.css", import.meta.url), "utf8");

test("el pulido de HOME se inyecta una sola vez", () => {
  const source = "<!doctype html><html><head><title>Home</title></head><body></body></html>";
  const first = injectHomePolish(source);
  const second = injectHomePolish(first);
  assert.equal((second.match(/home-polish\.css/g) ?? []).length, 1);
});

test("el pulido solo cambia presentación y conserva el hero real", () => {
  assert.match(polish, /#home-hero/);
  assert.match(polish, /atelier-header-logo/);
  assert.match(polish, /hero-editorial-visual/);
  assert.match(polish, /position:\s*absolute/);
  assert.match(polish, /width:\s*min\(47vw, 900px\)/);
  assert.doesNotMatch(polish, /Brisa y Azahar|Tierra Serena|El Taller de Lucía/);
});

test("Docker aplica el pulido después del sistema premium", () => {
  const premium = dockerfile.indexOf("prepare-premium-ui.mjs");
  const home = dockerfile.indexOf("prepare-home-polish.mjs");
  assert.ok(premium >= 0);
  assert.ok(home > premium);
});
