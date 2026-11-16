import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

export const root = path.dirname(fileURLToPath(import.meta.url));
const data = path.join(root, "data");
await fs.mkdir(data, { recursive: true });
const secretFile = path.join(data, "local-credentials.json");
let secrets;
try {
  secrets = JSON.parse(await fs.readFile(secretFile, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  secrets = {
    admin: randomBytes(24).toString("hex"),
    app: randomBytes(24).toString("hex"),
  };
  await fs.writeFile(secretFile, JSON.stringify(secrets), { mode: 0o600 });
}
export const config = {
  host: "127.0.0.1",
  port: Number(process.env.MECH_DB_PORT || 55432),
  database: "mechwar_x",
  user: "postgres",
  password: secrets.admin,
  options: "-c search_path=arena,public -c timezone=UTC",
  connectionTimeoutMillis: 5000,
};
export async function startDatabase() {
  const cluster = new EmbeddedPostgres({
    databaseDir: path.join(data, "postgres"),
    user: "postgres",
    password: secrets.admin,
    port: config.port,
    authMethod: "scram-sha-256",
    persistent: true,
    autoRehydrateSymlinks: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-h", "127.0.0.1", "-c", "timezone=UTC"],
    onLog: () => {},
    onError: () => {},
  });
  try {
    await fs.access(path.join(data, "postgres", "PG_VERSION"));
  } catch {
    await cluster.initialise();
  }
  await cluster.start();
  const admin = new pg.Client({ ...config, database: "postgres" });
  await admin.connect();
  if (
    !(await admin.query("SELECT 1 FROM pg_database WHERE datname='mechwar_x'"))
      .rowCount
  ) {
    await admin.query("CREATE DATABASE mechwar_x");
  }
  if (
    !(await admin.query("SELECT 1 FROM pg_roles WHERE rolname='mechwar_app'"))
      .rowCount
  ) {
    // Password is locally generated hex, never user-controlled input.
    await admin.query(
      `CREATE ROLE mechwar_app LOGIN PASSWORD '${secrets.app}'`,
    );
  }
  await admin.end();
  const owner = new pg.Client(config);
  await owner.connect();
  if (
    !(await owner.query("SELECT 1 FROM pg_namespace WHERE nspname='arena'"))
      .rowCount
  ) {
    await owner.query(await fs.readFile(path.join(root, "schema.sql"), "utf8"));
    await owner.query(await fs.readFile(path.join(root, "seed.sql"), "utf8"));
  }
  await owner.end();
  const pool = new pg.Pool({
    ...config,
    user: "mechwar_app",
    password: secrets.app,
    max: 8,
  });
  return { pool, cluster };
}
