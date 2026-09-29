/**
 * Local PostgreSQL 16 for development, shipped through npm
 * (embedded-postgres). No system install or admin rights needed.
 *
 *   pnpm db:local        # keep this running in its own terminal
 *
 * Data lives in .local/postgres (git-ignored). Listens on localhost:5433,
 * user "postgres", password "fyndue-local", databases fyndue + fyndue_test.
 */
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const databaseDir = path.resolve(".local/postgres");
// Written once the databases exist; the Windows setup script waits for it.
const readyFile = path.resolve(".local/db-ready");
rmSync(readyFile, { force: true });
const pg = new EmbeddedPostgres({
  databaseDir,
  port: 5433,
  user: "postgres",
  password: "fyndue-local",
  persistent: true,
  // Always UTF-8, whatever the OS locale (e.g. a Cyrillic Windows would
  // otherwise produce WIN1251 databases).
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

async function initialise() {
  console.log("Initialising local PostgreSQL in .local/postgres ...");
  await pg.initialise();
}

if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await initialise();
await pg.start();

let client = pg.getPgClient();
await client.connect();

// Clusters created by an earlier version of this script may not be UTF-8.
// They only ever held a failed setup, so rebuild them.
const { rows } = await client.query(
  "SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = 'template1'",
);
if (rows[0]?.encoding !== "UTF8") {
  console.log(`Local database uses ${rows[0]?.encoding} encoding - rebuilding it as UTF-8 ...`);
  await client.end();
  await pg.stop();
  rmSync(databaseDir, { recursive: true, force: true });
  await initialise();
  await pg.start();
  client = pg.getPgClient();
  await client.connect();
}
for (const name of ["fyndue", "fyndue_test"]) {
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (rowCount === 0) {
    await client.query(`CREATE DATABASE ${name}`);
    console.log(`Created database ${name}`);
  }
}
await client.end();

writeFileSync(readyFile, String(process.pid));
console.log("PostgreSQL ready on localhost:5433 (Ctrl+C to stop)");

const shutdown = async () => {
  rmSync(readyFile, { force: true });
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
