/**
 * Local PostgreSQL 16 for development, shipped through npm
 * (embedded-postgres). No system install or admin rights needed.
 *
 *   pnpm db:local        # keep this running in its own terminal
 *
 * Data lives in .local/postgres (git-ignored). Listens on localhost:5433,
 * user "postgres", password "fyndue-local", databases fyndue + fyndue_test.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const databaseDir = path.resolve(".local/postgres");
const pg = new EmbeddedPostgres({
  databaseDir,
  port: 5433,
  user: "postgres",
  password: "fyndue-local",
  persistent: true,
  onLog: () => {},
});

if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
  console.log("Initialising local PostgreSQL in .local/postgres ...");
  await pg.initialise();
}
await pg.start();

const client = pg.getPgClient();
await client.connect();
for (const name of ["fyndue", "fyndue_test"]) {
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (rowCount === 0) {
    await client.query(`CREATE DATABASE ${name}`);
    console.log(`Created database ${name}`);
  }
}
await client.end();

console.log("PostgreSQL ready on localhost:5433 (Ctrl+C to stop)");

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
