#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const PREMIUM_STYLESHEET = '<link rel="stylesheet" href="/premium-ui.css">';
const PREMIUM_SCRIPT = '<script src="/premium-ui.js" defer></script>';

export function injectPremiumAssets(source) {
  let html = String(source ?? "");
  if (!html.includes("</head>")) {
    throw new Error("El documento HTML no contiene </head>.");
  }

  if (!html.includes('href="/premium-ui.css"')) {
    html = html.replace("</head>", `  ${PREMIUM_STYLESHEET}\n</head>`);
  }
  if (!html.includes('src="/premium-ui.js"')) {
    html = html.replace("</head>", `  ${PREMIUM_SCRIPT}\n</head>`);
  }
  return html;
}

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(target);
  }
  return files;
}

export async function preparePremiumUi(publicDirectory) {
  const root = resolve(publicDirectory);
  const files = await htmlFiles(root);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const result = injectPremiumAssets(source);
    if (result !== source) await writeFile(file, result, "utf8");
  }
  return files.length;
}

async function main() {
  const [publicDirectory] = process.argv.slice(2);
  if (!publicDirectory) throw new Error("Uso: prepare-premium-ui.mjs DIRECTORIO_PUBLICO");
  const count = await preparePremiumUi(publicDirectory);
  console.log(`Sistema visual premium aplicado a ${count} documentos HTML.`);
}

const invokedAsScript = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
