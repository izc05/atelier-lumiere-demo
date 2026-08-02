import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const requiredFiles = [
  "index.html",
  "tienda/index.html",
  "blog/index.html",
  "cuenta/index.html",
  "carrito/index.html",
  "admin/index.html",
  "admin/proveedores/index.html",
  "admin/articulos/index.html",
  "admin/blog/index.html",
  "proveedor/activar/index.html",
  "preview-entrada/index.html",
  "preview-entrada/entry.css",
  "preview-entrada/entry.js",
  "assets/brand/favicon.svg",
  "assets/brand/brand.css",
  "assets/brand/brand.js"
];

const failures = [];
const contents = new Map();

async function readRequired(path) {
  try {
    await access(path, constants.R_OK);
    const content = await readFile(path, "utf8");
    contents.set(path, content);
    return content;
  } catch {
    failures.push(`Falta el archivo requerido: ${path}`);
    return "";
  }
}

for (const file of requiredFiles) {
  await readRequired(file);
}

const home = contents.get("index.html") ?? "";
const entry = contents.get("preview-entrada/index.html") ?? "";
const providers = contents.get("admin/proveedores/index.html") ?? "";
const articles = contents.get("admin/articulos/index.html") ?? "";
const blogAdmin = contents.get("admin/blog/index.html") ?? "";
const providerActivation = contents.get("proveedor/activar/index.html") ?? "";

const requiredHomeTexts = [
  "Atelier Lumière",
  "Cada pieza guarda un instante",
  "Encontrar mi pieza",
  "Pedir un diseño propio",
  "/atelier-lumiere-demo/cuenta/",
  "/atelier-lumiere-demo/carrito/",
  "/atelier-lumiere-demo/assets/brand/brand.css",
  "/atelier-lumiere-demo/assets/brand/brand.js"
];

for (const text of requiredHomeTexts) {
  if (!home.includes(text)) {
    failures.push(`La portada ha perdido una referencia protegida: ${text}`);
  }
}

if (home.includes("Alma de Fiesta")) {
  failures.push("La portada vuelve a mostrar la marca anterior Alma de Fiesta.");
}

for (const text of ["Atelier Lumière", "Entrar al taller", "Saltar introducción"]) {
  if (!entry.includes(text)) {
    failures.push(`La entrada interactiva ha perdido el texto: ${text}`);
  }
}

if (!providers.includes("Proveedores") || !providers.includes("Gestión privada")) {
  failures.push("La administración de proveedores ya no conserva su estructura básica.");
}

if (!articles.includes("Artículos") || !articles.includes("Catálogo por proveedor")) {
  failures.push("La administración de artículos ya no conserva su estructura básica.");
}

if (!blogAdmin.includes("Blog") || !blogAdmin.includes("Publicaciones")) {
  failures.push("La sección editorial del blog ya no está disponible.");
}

if (!providerActivation.includes("Activar acceso de proveedor")) {
  failures.push("La ruta de activación de proveedores ha desaparecido.");
}

for (const secretPath of [".env", "source/.env", "source/apps/web/.env", "source/apps/api/.env"]) {
  try {
    await access(secretPath, constants.F_OK);
    failures.push(`No se permite guardar secretos en el repositorio: ${secretPath}`);
  } catch {
    // Correcto: el archivo no existe.
  }
}

if (failures.length > 0) {
  console.error("Validación de Atelier Lumière fallida:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`Validación correcta: ${requiredFiles.length} archivos y rutas protegidas revisadas.`);
