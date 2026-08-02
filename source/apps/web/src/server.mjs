import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.WEB_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.WEB_PORT ?? "3000", 10);
const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

function safePublicPath(pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalized = normalize(relative);
  if (normalized.startsWith("..")) return null;
  return join(publicDirectory, normalized);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const filePath = safePublicPath(url.pathname);

  if (request.method !== "GET" || !filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("No encontrado");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; connect-src 'self' http://localhost:4000; style-src 'self'; script-src 'self'; img-src 'self' data:"
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("No encontrado");
  }
});

server.listen(port, host, () => {
  console.log(`Atelier Lumière web fuente disponible en http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`Cerrando web por ${signal}…`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
