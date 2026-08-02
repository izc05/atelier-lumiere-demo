import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const base = "/atelier-lumiere-demo/";
const pages = [
  "index.html",
  "tienda/index.html",
  "producto/index.html",
  "carrito/index.html",
  "checkout/index.html",
  "cuenta/index.html",
  "admin/index.html",
  "blog/index.html",
  "aviso-legal/index.html",
  "privacidad/index.html",
  "cookies/index.html"
];

const failures = [];
const contents = new Map();

for (const file of [...pages, "assets/app.css", "assets/app.js", "robots.txt", "sitemap.xml"]) {
  try {
    await access(file, constants.R_OK);
    contents.set(file, await readFile(file, "utf8"));
  } catch {
    failures.push(`Falta el archivo requerido: ${file}`);
  }
}

for (const file of pages.slice(0, 8)) {
  const html = contents.get(file) ?? "";
  if (html.includes("/_next/static/")) failures.push(`${file} todavía depende de bundles minificados de Next.js`);
  if (!html.includes(`${base}assets/app.css`)) failures.push(`${file} no carga la hoja de estilos compartida`);
  if (!html.includes("<meta name=\"viewport\"")) failures.push(`${file} no define viewport móvil`);
  if (/https:\/\/(instagram|pinterest)\.com/.test(html)) failures.push(`${file} contiene enlaces sociales genéricos`);
}

const home = contents.get("index.html") ?? "";
if (!home.includes("Cada pieza guarda un instante")) failures.push("La portada no contiene un titular visible en HTML");
if (/opacity\s*:\s*0/.test(home)) failures.push("La portada vuelve a ocultar contenido esencial con opacity:0");

const store = contents.get("tienda/index.html") ?? "";
if ((store.match(/data-product-card/g) ?? []).length < 6) failures.push("La tienda debe contener seis fichas visibles sin depender de JavaScript");
if (!store.includes("tienda/?encargo=1")) failures.push("Falta el acceso directo al encargo personalizado");

for (const file of ["admin/index.html", "cuenta/index.html", "checkout/index.html", "carrito/index.html"]) {
  const html = contents.get(file) ?? "";
  if (!/meta name="robots" content="noindex/i.test(html)) failures.push(`${file} debe permanecer fuera de los buscadores`);
}

const app = contents.get("assets/app.js") ?? "";
for (const expected of [
  'params.get("encargo") === "1"',
  "name: String(data.get(\"name\")",
  "email: String(data.get(\"email\")",
  "currentProvider && currentProvider !== product.providerId",
  "status: \"active\"",
  "status: \"invited\""
]) {
  if (!app.includes(expected)) failures.push(`Falta una protección funcional en app.js: ${expected}`);
}

const linkPattern = /(?:href|src)="(\/atelier-lumiere-demo\/[^"?#]*)(?:[?#][^"]*)?"/g;
for (const file of pages) {
  const html = contents.get(file) ?? "";
  for (const match of html.matchAll(linkPattern)) {
    let target = match[1].slice(base.length);
    if (!target) target = "index.html";
    else if (target.endsWith("/")) target += "index.html";
    try {
      await access(target, constants.R_OK);
    } catch {
      failures.push(`${file} enlaza a un recurso inexistente: ${match[1]}`);
    }
  }
}

if (failures.length) {
  console.error("Validación fallida:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`Validación correcta: ${pages.length} páginas y recursos compartidos revisados.`);
