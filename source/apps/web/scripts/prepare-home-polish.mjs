#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HOME_STYLESHEET = '<link rel="stylesheet" href="/home-polish.css">';
const HOME_FRAMING_SCRIPT = '<script defer src="/home-product-framing.js"></script>';

export function injectHomePolish(source) {
  let html = String(source ?? "");
  if (!html.includes("</head>")) {
    throw new Error("La HOME no contiene </head>.");
  }
  if (!html.includes('href="/home-polish.css"')) {
    html = html.replace("</head>", `  ${HOME_STYLESHEET}\n</head>`);
  }
  if (!html.includes('src="/home-product-framing.js"')) {
    html = html.replace("</head>", `  ${HOME_FRAMING_SCRIPT}\n</head>`);
  }
  return html;
}

export async function prepareHomePolish(indexFile) {
  const target = resolve(indexFile);
  const source = await readFile(target, "utf8");
  const result = injectHomePolish(source);
  if (result !== source) await writeFile(target, result, "utf8");
}

async function main() {
  const [indexFile] = process.argv.slice(2);
  if (!indexFile) throw new Error("Uso: prepare-home-polish.mjs RUTA_INDEX_HOME");
  await prepareHomePolish(indexFile);
  console.log("Pulido visual de HOME aplicado.");
}

const invokedAsScript = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  });
}
