#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import process from "node:process";
import QRCode from "qrcode";
import { createAdminBootstrapService } from "./admin-bootstrap-service.mjs";
import { createDatabase } from "./database.mjs";

const AUTH_SERVICE_USER_ID = process.env.AUTH_SERVICE_USER_ID
  ?? "00000000-0000-4000-8000-000000000008";

function requireInteractiveTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Este comando exige una terminal interactiva. Ejecútalo con docker compose exec -it api ..."
    );
  }
}

function readHiddenLine(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    const previousRawMode = Boolean(input.isRaw);
    let value = "";
    let completed = false;

    function restore() {
      input.off("data", onData);
      if (typeof input.setRawMode === "function") input.setRawMode(previousRawMode);
      output.write("\n");
    }

    function finish(callback) {
      if (completed) return;
      completed = true;
      restore();
      callback();
    }

    function onData(chunk) {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          finish(() => reject(new Error("Operación cancelada.")));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish(() => resolve(value));
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          output.write("*");
        }
      }
    }

    output.write(prompt);
    input.setEncoding("utf8");
    if (typeof input.setRawMode === "function") input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function readVisibleQuestions() {
  const interfaceInstance = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });
  try {
    const email = (await interfaceInstance.question("Correo del administrador: ")).trim();
    const displayName = (await interfaceInstance.question("Nombre visible: ")).trim();
    return { email, displayName };
  } finally {
    interfaceInstance.close();
  }
}

async function readFactorCode() {
  const interfaceInstance = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });
  try {
    return (await interfaceInstance.question("Código de seis cifras del autenticador: ")).trim();
  } finally {
    interfaceInstance.close();
  }
}

async function main() {
  requireInteractiveTerminal();

  console.log("\nAtelier Lumière · Activación inicial de Administración");
  console.log("Este proceso solo puede completarse una vez.\n");

  const database = createDatabase();
  if (!database.enabled) throw new Error("DATABASE_URL no está configurada.");

  const service = createAdminBootstrapService({
    database,
    systemContext: Object.freeze({
      role: "ADMIN",
      userId: AUTH_SERVICE_USER_ID,
      providerId: null
    })
  });

  try {
    const { email, displayName } = await readVisibleQuestions();
    const password = await readHiddenLine("Contraseña (mínimo 14 caracteres): ");
    const repeatedPassword = await readHiddenLine("Repite la contraseña: ");

    if (password !== repeatedPassword) {
      throw new Error("Las contraseñas no coinciden. No se ha modificado la base de datos.");
    }

    const prepared = await service.prepare({ email, displayName, password });
    const qr = await QRCode.toString(prepared.otpauthUri, {
      type: "terminal",
      small: true,
      errorCorrectionLevel: "M"
    });

    console.log("\nEscanea este QR con Google Authenticator, Microsoft Authenticator o equivalente:\n");
    console.log(qr);
    console.log("Clave manual (se muestra una sola vez):");
    console.log(prepared.totpSecret);
    console.log();

    const factorCode = await readFactorCode();
    const account = await service.activate(prepared, factorCode);

    console.log("\nCuenta PLATFORM_OWNER activada correctamente.");
    console.log(`Correo: ${account.email}`);
    console.log(`Nombre: ${account.displayName}`);
    console.log("\nCÓDIGOS DE RECUPERACIÓN — GUÁRDALOS AHORA EN UN LUGAR SEGURO");
    console.log("No volverán a mostrarse y cada uno solo puede utilizarse una vez.\n");
    for (const code of prepared.recoveryCodes) console.log(code);
    console.log("\nYa puedes activar ENABLE_ADMIN_UI=true y entrar en /admin/proveedores/.\n");
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  const message = error?.message ?? "No se pudo completar la activación administrativa.";
  console.error(`\nERROR: ${message}`);
  if (error?.code === "PLATFORM_OWNER_ALREADY_EXISTS") {
    console.error("Utiliza la recuperación administrativa; no vuelvas a ejecutar el bootstrap.");
  }
  process.exitCode = 1;
});
