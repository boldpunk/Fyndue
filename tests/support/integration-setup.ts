import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "dotenv";

config({ quiet: true });
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL must be set for integration tests");
if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL — the test run truncates every table");
}
// Point the shared Prisma client at the test database before it is imported.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// Documents written by tests go to a throwaway folder.
process.env.STORAGE_DIR = path.join(tmpdir(), `fyndue-test-storage-${process.pid}`);
