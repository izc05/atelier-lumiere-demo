import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dockerfileUrl = new URL("../infra/docker/Dockerfile.web", import.meta.url);
const homeUrl = new URL("../apps/web/public/index.html", import.meta.url);

test("la imagen web de producción no sobrescribe la HOME real con la demo antigua", async () => {
  const dockerfile = await readFile(dockerfileUrl, "utf8");
  const home = await readFile(homeUrl, "utf8");

  assert.doesNotMatch(dockerfile, /prepare-original-home\.mjs/);
  assert.doesNotMatch(dockerfile, /COPY\s+index\.html\s+\/demo\/index\.html/);
  assert.doesNotMatch(dockerfile, /COPY\s+_next\s+\/demo\/_next/);
  assert.match(dockerfile, /COPY\s+source\/apps\/web\s+\.\/apps\/web/);

  assert.match(home, /id="brand-entry"/);
  assert.match(home, />Talleres</);
  assert.match(home, />Historias</);
  assert.doesNotMatch(home, /Brisa y Azahar|El Taller de Lucía|Tierra Serena/);
});
