import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadMigrations,
  MigrationError,
  runMigrationsWithClient,
  stripTransactionWrapper
} from "../src/migrate-database.mjs";

function migration(filename, checksum, sql = "SELECT 1;") {
  return Object.freeze({
    version: filename.slice(0, 4),
    filename,
    checksum,
    sql
  });
}

function fakeClient({ applied = [], existingTables = [] } = {}) {
  const calls = [];
  const records = [...applied];
  return {
    calls,
    records,
    async query(text, values = []) {
      const compact = String(text).replace(/\s+/g, " ").trim();
      calls.push({ text: compact, values });

      if (compact.includes("FROM schema_migrations") && compact.startsWith("SELECT")) {
        return { rowCount: records.length, rows: [...records] };
      }
      if (compact.includes("FROM pg_catalog.pg_tables")) {
        return {
          rowCount: existingTables.length,
          rows: existingTables.map((tablename) => ({ tablename }))
        };
      }
      if (compact.startsWith("INSERT INTO schema_migrations")) {
        records.push({
          filename: values[0],
          version: values[1],
          checksum_sha256: values[2],
          execution_ms: values[3]
        });
      }
      return { rowCount: 1, rows: [] };
    }
  };
}

test("elimina únicamente el BEGIN y COMMIT exteriores", () => {
  const body = stripTransactionWrapper("\nBEGIN;\nSELECT 1;\nCOMMIT;\n", "0001_test.sql");
  assert.equal(body, "SELECT 1;");
  assert.throws(
    () => stripTransactionWrapper("SELECT 1;", "0001_test.sql"),
    (error) => error.code === "MIGRATION_TRANSACTION_WRAPPER_REQUIRED"
  );
});

test("descubre migraciones por orden de nombre y calcula su checksum", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atelier-migrations-"));
  try {
    await writeFile(path.join(directory, "0002_second.sql"), "BEGIN;\nSELECT 2;\nCOMMIT;\n");
    await writeFile(path.join(directory, "0001_first.sql"), "BEGIN;\nSELECT 1;\nCOMMIT;\n");
    const migrations = await loadMigrations(directory);

    assert.deepEqual(migrations.map((item) => item.filename), [
      "0001_first.sql",
      "0002_second.sql"
    ]);
    assert.match(migrations[0].checksum, /^[a-f0-9]{64}$/);
    assert.equal(migrations[0].sql, "SELECT 1;");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("acepta prefijos numéricos repetidos y mantiene el orden por nombre completo", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atelier-migrations-"));
  try {
    await writeFile(path.join(directory, "0015_second.sql"), "BEGIN;\nSELECT 2;\nCOMMIT;\n");
    await writeFile(path.join(directory, "0015_first.sql"), "BEGIN;\nSELECT 1;\nCOMMIT;\n");
    const migrations = await loadMigrations(directory);

    assert.deepEqual(migrations.map((item) => item.filename), [
      "0015_first.sql",
      "0015_second.sql"
    ]);
    assert.deepEqual(migrations.map((item) => item.version), ["0015", "0015"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rechaza nombres SQL que no respetan el formato versionado", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atelier-migrations-"));
  try {
    await writeFile(path.join(directory, "migration.sql"), "BEGIN; SELECT 1; COMMIT;");
    await assert.rejects(
      loadMigrations(directory),
      (error) => error.code === "INVALID_MIGRATION_FILENAME"
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("aplica solo las pendientes y registra el checksum en la misma transacción", async () => {
  const migrations = [
    migration("0001_first.sql", "a".repeat(64), "SELECT 'first';"),
    migration("0002_second.sql", "b".repeat(64), "SELECT 'second';")
  ];
  const client = fakeClient({
    applied: [{
      filename: "0001_first.sql",
      version: "0001",
      checksum_sha256: "a".repeat(64),
      applied_at: new Date()
    }]
  });
  const messages = [];

  const result = await runMigrationsWithClient({
    client,
    migrations,
    logger: {
      info(message) { messages.push(message); },
      error() {}
    }
  });

  assert.equal(result.applied, 1);
  assert.equal(result.verified, 2);
  assert.equal(client.records.at(-1).filename, "0002_second.sql");
  assert.ok(client.calls.some(({ text }) => text === "SELECT 'second';"));
  assert.ok(client.calls.some(({ text }) => text === "COMMIT"));
  assert.match(messages[0], /0002_second\.sql/);
});

test("bloquea una migración aplicada cuyo contenido cambió", async () => {
  const migrations = [migration("0001_first.sql", "a".repeat(64))];
  const client = fakeClient({
    applied: [{
      filename: "0001_first.sql",
      version: "0001",
      checksum_sha256: "b".repeat(64),
      applied_at: new Date()
    }]
  });

  await assert.rejects(
    runMigrationsWithClient({ client, migrations }),
    (error) => error instanceof MigrationError && error.code === "APPLIED_MIGRATION_CHANGED"
  );
  assert.equal(client.calls.some(({ text }) => text === "BEGIN"), false);
});

test("rechaza una base antigua con tablas pero sin historial", async () => {
  const client = fakeClient({ existingTables: ["users", "providers"] });

  await assert.rejects(
    runMigrationsWithClient({
      client,
      migrations: [migration("0001_first.sql", "a".repeat(64))]
    }),
    (error) => error.code === "UNTRACKED_EXISTING_SCHEMA"
  );
  assert.equal(client.calls.some(({ text }) => text === "BEGIN"), false);
});

test("libera el bloqueo incluso cuando falla una migración", async () => {
  const client = fakeClient();
  const originalQuery = client.query.bind(client);
  client.query = async (text, values = []) => {
    if (String(text).includes("SELECT 'boom'")) throw new Error("boom");
    return originalQuery(text, values);
  };

  await assert.rejects(
    runMigrationsWithClient({
      client,
      migrations: [migration("0001_first.sql", "a".repeat(64), "SELECT 'boom';")],
      logger: { info() {}, error() {} }
    }),
    (error) => error.code === "MIGRATION_EXECUTION_FAILED"
  );

  assert.ok(client.calls.some(({ text }) => text === "ROLLBACK"));
  assert.ok(client.calls.some(({ text }) => text.includes("pg_advisory_unlock")));
});
