/** Shared Zod validation/line definitions for the offline refresh command (Node 24). */
import { readFileSync } from "node:fs";
import { lines, validateSnapshot } from "../src/lib/catalogue/schema.ts";

if (process.argv[2] === "lines") {
  process.stdout.write(JSON.stringify(lines));
} else if (process.argv[2] === "validate" && process.argv[3]) {
  const snapshot = validateSnapshot(JSON.parse(readFileSync(process.argv[3], "utf8")));
  process.stdout.write(JSON.stringify(snapshot.metadata));
} else {
  throw new Error("Usage: node scripts/catalogue-snapshot.mjs lines|validate <snapshot.json>");
}
