import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const fileArg = process.argv[2];
if (!fileArg) throw new Error("Uso: node scripts/write-smtp-env.mjs ARCHIVO_ENV");
const filePath = resolve(fileArg);
const values = {
  SMTP_ENABLED: "true",
  SMTP_VERIFY_ON_START: "true",
  SMTP_HOST: process.env.ATELIER_SMTP_HOST ?? "",
  SMTP_PORT: process.env.ATELIER_SMTP_PORT ?? "587",
  SMTP_SECURE: process.env.ATELIER_SMTP_SECURE ?? "false",
  SMTP_REQUIRE_TLS: process.env.ATELIER_SMTP_REQUIRE_TLS ?? "true",
  SMTP_USER: process.env.ATELIER_SMTP_USER ?? "",
  SMTP_PASSWORD: process.env.ATELIER_SMTP_PASSWORD ?? "",
  SMTP_FROM: process.env.ATELIER_SMTP_FROM ?? "",
  SMTP_REPLY_TO: process.env.ATELIER_SMTP_REPLY_TO ?? "",
  ORDER_EMAIL_NOTIFICATIONS_ENABLED: "false"
};
for (const [key, value] of Object.entries(values)) {
  if (key !== "SMTP_USER" && key !== "SMTP_PASSWORD" && key !== "SMTP_REPLY_TO" && !String(value).trim()) {
    throw new Error(`${key} no puede estar vacío.`);
  }
}
let content = await readFile(filePath, "utf8");
for (const [key, raw] of Object.entries(values)) {
  const line = `${key}=${JSON.stringify(String(raw))}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  content = pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
}
const temporary = resolve(dirname(filePath), `.smtp-env-${randomUUID()}.tmp`);
await writeFile(temporary, content, { mode: 0o600 });
await chmod(temporary, 0o600);
await rename(temporary, filePath);
