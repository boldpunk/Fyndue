import { execSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "dotenv";

/** Applies migrations to the dedicated test database once per run. */
export default function setup() {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must be set for integration tests");
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: url },
  });
  // Teardown: remove the throwaway document folders (see integration-setup.ts).
  return () => {
    for (const entry of readdirSync(tmpdir())) {
      if (entry.startsWith("fyndue-test-storage-")) rmSync(path.join(tmpdir(), entry), { recursive: true, force: true });
    }
  };
}
