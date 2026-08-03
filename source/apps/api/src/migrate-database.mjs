#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const MIGRATION_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;
const LOCK_NAME = "atelier-lumiere:schema-migrations";
const DEFAULT_MIGRATIONS_PATH = fileURLToPath(
  new URL("../../../packages/database/migrations/", import.meta.url)
);

export class MigrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MigrationError";
    this.code = code;
    this.details = details;
  }
}

function positiveInteger(value, fallback, field, { min = 1, max = 900_000 } = {}) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new TypeError(`${field} debe estar entre ${min} y ${max}.`);
  }
  return parsed;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function stripTransactionWrapper(rawSql, filename = "migration.sql") {
  const normalized = String(rawSql).replace(/^\uFEFF/, "").trim();
  const begin = normalized.match(/^BEGIN;\s*/i);
  const commit = normalized.match(/\s*COMMIT;\s*$/i);

  if (!begin || !commit || commit.index === undefined) {
    throw new MigrationError(
      "MIGRATION_TRANSACTION_WRAPPER_REQUIRED",
      `${filename} debe comenzar con BEGIN; y terminar con COMMIT;.`,
      { filename }
    );
  }

  const body = normalized.slice(begin[0].length, commit.index).trim();
  if (!body) {
    throw new MigrationError(
      "EMPTY_MIGRATION",
      `${filename} no contiene sentencias para ejecutar.`,
      { filename }
    );
  }
  return body;
}

export async function loadMigrations(directory = DEFAULT_MIGRATIONS_PATH) {
  const entries = await readdir(directory, { withFileTypes: true });
  const invalidSql = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql") && !MIGRATION_PATTERN.test(entry.name))
    .map((entry) => entry.name);

  if (invalidSql.length > 0) {
    throw new MigrationError(
      "INVALID_MIGRATION_FILENAME",
      "Todas las migraciones SQL deben usar el formato 0001_nombre_descriptivo.sql.",
      { filenames: invalidSql }
    );
  }

  const filenames = entries
    .filter((entry) => entry.isFile() && MIGRATION_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));

  if (filenames.length === 0) {
    throw new MigrationError(
      "NO_MIGRATIONS_FOUND",
      `No se encontraron migraciones en ${directory}.`,
      { directory }
    );
  }

  const versions = new Set();
  const migrations = [];
  for (const filename of filenames) {
    const version = filename.match(MIGRATION_PATTERN)[1];
    if (versions.has(version)) {
      throw new MigrationError(
        "DUPLICATE_MIGRATION_VERSION",
        `La versión ${version} aparece en más de una migración.`,
        { version }
      );
    }
    versions.add(version);

    const absolutePath = path.join(directory, filename);
    const bytes = await readFile(absolutePath);
    migrations.push(Object.freeze({
      version,
      filename,
      checksum: sha256(bytes),
      sql: stripTransactionWrapper(bytes.toString("utf8"), filename)
    }));
  }

  return Object.freeze(migrations);
}

async function acquireLock(client) {
  await client.query("SELECT pg_advisory_lock(hashtext($1))", [LOCK_NAME]);
}

async function releaseLock(client) {
  await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_NAME]);
}

async function ensureHistoryTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      version text NOT NULL UNIQUE,
      checksum_sha256 char(64) NOT NULL,
      execution_ms integer NOT NULL CHECK (execution_ms >= 0),
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadExistingPublicTables(client) {
  const result = await client.query(`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'schema_migrations'
    ORDER BY tablename
  `);
  return result.rows.map((row) => row.tablename);
}

async function loadAppliedMigrations(client) {
  const result = await client.query(`
    SELECT filename, version, checksum_sha256, applied_at
    FROM schema_migrations
    ORDER BY filename
  `);
  return result.rows;
}

function verifyHistory(migrations, appliedRows) {
  const available = new Map(migrations.map((migration) => [migration.filename, migration]));
  const applied = new Map(appliedRows.map((row) => [row.filename, row]));

  for (const row of appliedRows) {
    const migration = available.get(row.filename);
    if (!migration) {
      throw new MigrationError(
        "APPLIED_MIGRATION_MISSING",
        `La migración aplicada ${row.filename} ya no existe en el repositorio.`,
        { filename: row.filename }
      );
    }
    if (migration.version !== row.version) {
      throw new MigrationError(
        "MIGRATION_VERSION_CHANGED",
        `La versión registrada de ${row.filename} no coincide con el archivo actual.`,
        { filename: row.filename }
      );
    }
    if (migration.checksum !== row.checksum_sha256) {
      throw new MigrationError(
        "APPLIED_MIGRATION_CHANGED",
        `La migración aplicada ${row.filename} fue modificada. Crea una migración nueva.`,
        { filename: row.filename }
      );
    }
  }

  let pendingSeen = false;
  for (const migration of migrations) {
    const isApplied = applied.has(migration.filename);
    if (!isApplied) pendingSeen = true;
    if (pendingSeen && isApplied) {
      throw new MigrationError(
        "MIGRATION_HISTORY_GAP",
        `El historial contiene ${migration.filename} pero falta una migración anterior.`,
        { filename: migration.filename }
      );
    }
  }

  return migrations.filter((migration) => !applied.has(migration.filename));
}

async function applyMigration(client, migration, {
  statementTimeoutMs,
  lockTimeoutMs,
  logger
}) {
  const startedAt = Date.now();
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('statement_timeout', $1, true)", [
      `${statementTimeoutMs}ms`
    ]);
    await client.query("SELECT set_config('lock_timeout', $1, true)", [
      `${lockTimeoutMs}ms`
    ]);
    await client.query(migration.sql);
    const executionMs = Math.max(0, Date.now() - startedAt);
    await client.query(
      `INSERT INTO schema_migrations
        (filename, version, checksum_sha256, execution_ms)
       VALUES ($1, $2, $3, $4)`,
      [migration.filename, migration.version, migration.checksum, executionMs]
    );
    await client.query("COMMIT");
    logger.info(`Migración aplicada: ${migration.filename} (${executionMs} ms)`);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logger.error("No se pudo revertir la migración fallida.", rollbackError);
    }
    throw new MigrationError(
      "MIGRATION_EXECUTION_FAILED",
      `Falló ${migration.filename}: ${error?.message ?? "error desconocido"}`,
      { filename: migration.filename, cause: error?.code ?? null }
    );
  }
}

export async function runMigrationsWithClient({
  client,
  migrations,
  statementTimeoutMs = 120_000,
  lockTimeoutMs = 10_000,
  logger = console
}) {
  if (!client || typeof client.query !== "function") {
    throw new TypeError("El ejecutor necesita un cliente PostgreSQL.");
  }
  if (!Array.isArray(migrations) || migrations.length === 0) {
    throw new TypeError("El ejecutor necesita al menos una migración.");
  }

  await acquireLock(client);
  try {
    await ensureHistoryTable(client);
    const appliedRows = await loadAppliedMigrations(client);

    if (appliedRows.length === 0) {
      const existingTables = await loadExistingPublicTables(client);
      if (existingTables.length > 0) {
        throw new MigrationError(
          "UNTRACKED_EXISTING_SCHEMA",
          "La base contiene tablas pero no tiene historial de migraciones. No se modificará automáticamente.",
          { tables: existingTables }
        );
      }
    }

    const pending = verifyHistory(migrations, appliedRows);
    if (pending.length === 0) {
      logger.info(`Base de datos actualizada: ${appliedRows.length} migraciones verificadas.`);
      return Object.freeze({ applied: 0, verified: appliedRows.length });
    }

    for (const migration of pending) {
      await applyMigration(client, migration, {
        statementTimeoutMs,
        lockTimeoutMs,
        logger
      });
    }

    return Object.freeze({
      applied: pending.length,
      verified: appliedRows.length + pending.length
    });
  } finally {
    await releaseLock(client);
  }
}

export async function runDatabaseMigrations({
  connectionString = process.env.DATABASE_URL,
  migrationsPath = process.env.MIGRATIONS_PATH ?? DEFAULT_MIGRATIONS_PATH,
  statementTimeoutMs = positiveInteger(
    process.env.MIGRATION_STATEMENT_TIMEOUT_MS,
    120_000,
    "MIGRATION_STATEMENT_TIMEOUT_MS"
  ),
  lockTimeoutMs = positiveInteger(
    process.env.MIGRATION_LOCK_TIMEOUT_MS,
    10_000,
    "MIGRATION_LOCK_TIMEOUT_MS",
    { max: 120_000 }
  ),
  logger = console
} = {}) {
  if (typeof connectionString !== "string" || connectionString.length < 1) {
    throw new TypeError("DATABASE_URL no está configurada.");
  }

  const migrations = await loadMigrations(migrationsPath);
  const client = new Client({
    connectionString,
    application_name: "atelier-lumiere-migrations",
    connectionTimeoutMillis: 10_000
  });

  await client.connect();
  try {
    return await runMigrationsWithClient({
      client,
      migrations,
      statementTimeoutMs,
      lockTimeoutMs,
      logger
    });
  } finally {
    await client.end();
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  runDatabaseMigrations()
    .then((result) => {
      console.log(
        `Migraciones completadas: ${result.applied} nuevas; ${result.verified} verificadas.`
      );
    })
    .catch((error) => {
      console.error(`ERROR DE MIGRACIÓN [${error?.code ?? "UNKNOWN"}]: ${error?.message}`);
      if (error?.code === "UNTRACKED_EXISTING_SCHEMA") {
        console.error(
          "Realiza una copia y utiliza el procedimiento de adopción de base existente antes de continuar."
        );
      }
      process.exitCode = 1;
    });
}
