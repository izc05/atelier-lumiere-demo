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

test("404 y 500 comparten la capa Visual V2 sin perder salidas seguras", async () => {
  const notFound = await text("404", "index.html");
  const serverError = await text("500", "index.html");
  const visual = await text("visual-v2-errors.css");

  for (const html of [notFound, serverError]) {
    assert.doesNotMatch(html, /visual-v2-tokens\.css/);
    assert.doesNotMatch(html, /postgres|database|stack|exception|bearer|token|\/srv\//i);
    assert.match(html, /visual-v2-errors\.css/);
    assert.match(html, /public-shell\.js/);
    assert.match(html, /href="\/"/);
    assert.match(html, /href="\/tienda\/"/);
    assert.match(html, /href="\/blog\/"/);
    assert.match(html, /href="\/legal\/"/);
    assert.match(html, /id="main-content"/);
  }

  assert.match(notFound, />404</);
  assert.match(notFound, /Esta pieza no está aquí/);
  assert.match(serverError, />500</);
  assert.match(serverError, /Algo no ha salido bien/);

  assert.match(visual, /@import url\("\/visual-v2-tokens\.css"\);/);
  assert.match(visual, /--v2-wine-950/);
  assert.match(visual, /@media \(max-width: 860px\)/);
  assert.match(visual, /@media \(max-width: 620px\)/);
  assert.match(visual, /prefers-reduced-motion:\s*reduce/);
});
