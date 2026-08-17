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

test("Únete adopta Visual V2 sin sustituir el flujo funcional", async () => {
  const html = await text("unete", "index.html");
  const logic = await text("unete", "join.js");
  const visual = await text("visual-v2-join.css");

  assert.match(html, /visual-v2-tokens\.css/);
  assert.match(html, /visual-v2-join\.css/);
  assert.match(html, /unete\/join\.js/);

  for (const id of [
    "workshop-application-form",
    "application-message",
    "form-view",
    "success-view",
    "application-reference"
  ]) {
    assert.ok(html.includes(`id="${id}"`), `Únete: falta el contrato DOM #${id}`);
    assert.ok(logic.includes(`#${id}`), `join.js: falta consumo de #${id}`);
  }

  for (const field of [
    "displayName",
    "legalName",
    "contactName",
    "contactEmail",
    "specialty",
    "websiteUrl",
    "message",
    "companyWebsite",
    "privacyAccepted"
  ]) {
    assert.ok(html.includes(`name="${field}"`), `Únete: falta el campo ${field}`);
  }

  assert.match(logic, /fetch\("\/internal\/workshop-applications"/);
  assert.match(logic, /method:\s*"POST"/);
  assert.match(logic, /form\.reportValidity\(\)/);
  assert.match(logic, /key !== "privacyAccepted"/);
  assert.match(logic, /reference\.textContent = payload\.application\.id/);
  assert.match(logic, /successView\.hidden = false/);

  assert.match(visual, /--v2-wine-950/);
  assert.match(visual, /@media \(max-width: 860px\)/);
  assert.match(visual, /@media \(max-width: 620px\)/);
  assert.match(visual, /prefers-reduced-motion:\s*reduce/);
});
