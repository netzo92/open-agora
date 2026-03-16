import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const source = resolve(repoRoot, "target/idl/open_agora.json");
const dest = resolve(repoRoot, "apps/web/src/idl/open_agora.json");

if (!existsSync(source)) {
  if (existsSync(dest)) {
    console.log("IDL source not found (no Anchor build), using existing IDL in apps/web.");
    process.exit(0);
  }
  console.error("Missing Anchor IDL at target/idl/open_agora.json");
  console.error("Run: anchor build");
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
cpSync(source, dest);
console.log("Synced Anchor IDL -> apps/web/src/idl/open_agora.json");
