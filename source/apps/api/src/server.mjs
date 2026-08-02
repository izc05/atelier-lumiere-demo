import { createServer } from "node:http";
import { createApiHandler } from "./app.mjs";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.API_PORT ?? "4000", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("API_PORT debe ser un puerto válido.");
}

const server = createServer(createApiHandler());

server.listen(port, host, () => {
  console.log(`Atelier Lumière API disponible en http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`Cerrando API por ${signal}…`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
