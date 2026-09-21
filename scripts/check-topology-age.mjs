/** Reports the age of the reviewed Northern topology capture without changing it. */

import { readFileSync } from "node:fs";
import { northernTopologyCaptureSchema } from "./northern-topology-schema.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

function usage() {
  throw new Error("Usage: node scripts/check-topology-age.mjs [capture.json] [--now ISO-8601] [--release]");
}

function parseArguments(args) {
  let inputPath = "data/northern-topology-capture.json";
  let now = new Date().toISOString();
  let release = false;
  let inputSpecified = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--release") release = true;
    else if (argument === "--now") {
      now = args[index + 1] ?? usage();
      index += 1;
    } else if (!argument.startsWith("--") && !inputSpecified) {
      inputPath = argument;
      inputSpecified = true;
    } else usage();
  }
  return { inputPath, now, release };
}

function captureFrom(path) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown input error";
    throw new Error(`Could not read Northern topology capture: ${message}`);
  }
  const parsed = northernTopologyCaptureSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid Northern topology capture for age check");
  return parsed.data;
}

const { inputPath, now, release } = parseArguments(process.argv.slice(2));
const capture = captureFrom(inputPath);
const nowTimestamp = Date.parse(now);
if (!Number.isFinite(nowTimestamp)) throw new Error("Topology age check requires a valid ISO-8601 --now timestamp");
const ageMilliseconds = nowTimestamp - Date.parse(capture.capturedAt);
const ageDays = Math.floor(ageMilliseconds / DAY_MS);

if (ageDays < 0) throw new Error("Topology capture time is in the future");
if (ageDays >= 23) {
  console.log(`WARNING: Northern topology snapshot is ${ageDays} days old; refresh and review the generated route changes before release.`);
} else {
  console.log(`Northern topology snapshot is ${ageDays} days old.`);
}

if (release && ageMilliseconds > 30 * DAY_MS) {
  console.error(`EXPIRED: Northern topology snapshot is more than 30 days old (${ageDays} full days); release verification requires a refresh.`);
  process.exitCode = 1;
}
