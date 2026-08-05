#!/usr/bin/env node

import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const DEMO_BASE_PATH = "/atelier-lumiere-demo";
const TEXT_SCRIPT_PATTERN = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const HIDDEN_RSC_PATTERN = /<div hidden="">[\s\S]*?<\/div>/i;

export function transformOriginalHomeHtml(source) {
  let html = String(source ?? "");

  if (!html.includes("hero-hilo-celebracion.webp") || !html.includes("Cada pieza guarda un instante")) {
    throw new Error("La exportación pública no contiene la portada original esperada.");
  }

  html = html
    .replace(TEXT_SCRIPT_PATTERN, "")
    .replace(HIDDEN_RSC_PATTERN, "")
    .replaceAll(`${DEMO_BASE_PATH}/`, "/")
    .replaceAll(`href="${DEMO_BASE_PATH}"`, "href=\"/\"")
    .replaceAll(`src="${DEMO_BASE_PATH}"`, "src=\"/\"")
    .replace(
      /<button class="button button-outline">Pedir un diseño propio<\/button>/,
      '<a class="button button-outline" href="/tienda/">Pedir un diseño propio</a>'
    );

  if (html.includes('<body class="')) {
    html = html.replace('<body class="', '<body class="original-home-static ');
  } else {
    html = html.replace("<body>", '<body class="original-home-static">');
  }

  html = html.replace(
    "</head>",
    '<meta name="robots" content="noindex,nofollow,noarchive">'
      + '<link rel="stylesheet" href="/original-home-overrides.css">'
      + "</head>"
  );
  html = html.replace(
    "</body>",
    '<script src="/original-home.js" defer></script></body>'
  );

  return html;
}

export async function prepareOriginalHome({ demoDirectory, publicDirectory }) {
  const demoRoot = resolve(demoDirectory);
  const publicRoot = resolve(publicDirectory);
  const sourceIndex = join(demoRoot, "index.html");
  const targetIndex = join(publicRoot, "index.html");

  await mkdir(publicRoot, { recursive: true });

  for (const directory of ["_next", "images", "assets"]) {
    await cp(join(demoRoot, directory), join(publicRoot, directory), {
      recursive: true,
      force: true
    });
  }

  const sourceHtml = await readFile(sourceIndex, "utf8");
  const transformedHtml = transformOriginalHomeHtml(sourceHtml);
  await writeFile(targetIndex, transformedHtml, "utf8");
}

async function main() {
  const [demoDirectory, publicDirectory] = process.argv.slice(2);
  if (!demoDirectory || !publicDirectory) {
    throw new Error("Uso: prepare-original-home.mjs DIRECTORIO_DEMO DIRECTORIO_PUBLICO");
  }
  await prepareOriginalHome({ demoDirectory, publicDirectory });
  console.log("Portada original preparada para la aplicación real.");
}

const invokedAsScript = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
