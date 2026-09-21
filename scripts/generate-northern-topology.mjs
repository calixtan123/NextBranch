/** Generates reviewed Northern server and browser topology artifacts from one validated JSON capture. */

import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { northernTopologyCaptureSchema } from "./northern-topology-schema.mjs";

const [inputPath, topologyOutput = "src/lib/northern/bundledTopology.ts", destinationsOutput = "src/lib/northern/direct-destination-map.ts"] = process.argv.slice(2);

if (!inputPath) {
  throw new Error("Usage: node scripts/generate-northern-topology.mjs <capture.json> [bundled-topology.ts] [direct-destination-map.ts]");
}

function readCapture(path) {
  let source;
  try {
    source = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown input error";
    throw new Error(`Could not read Northern topology capture: ${message}`);
  }

  const parsed = northernTopologyCaptureSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid Northern topology capture: ${parsed.error.issues[0]?.message ?? "schema validation failed"}`);
  }
  return parsed.data;
}

function directDestinations(topology) {
  const destinations = new Map();
  for (const item of topology) {
    for (const route of item.orderedLineRoutes) {
      route.naptanIds.forEach((from, index) => {
        const direct = destinations.get(from) ?? new Set();
        for (const to of route.naptanIds.slice(index + 1)) direct.add(to);
        destinations.set(from, direct);
      });
    }
  }
  return Object.fromEntries([...destinations].sort(([left], [right]) => left.localeCompare(right)).map(
    ([from, direct]) => [from, [...direct].sort()],
  ));
}

function topologyArtifact(capture) {
  return `import type { Topology } from "./schemas";\n\n/** Generated from the reviewed Northern topology capture. Run generate-northern-topology.mjs to refresh. */\nexport const bundledTopology: {\n  capturedAt: string;\n  maxAgeDays: number;\n  topology: Topology[];\n} = {\n  capturedAt: ${JSON.stringify(capture.capturedAt)},\n  maxAgeDays: 30,\n  topology: ${JSON.stringify(capture.topology, null, 2)},\n};\n`;
}

function destinationsArtifact(capture, destinations) {
  return `/** Generated from the reviewed Northern topology capture; do not place TfL topology in components. */\nexport const directDestinationCapturedAt = ${JSON.stringify(capture.capturedAt)};\nexport const directDestinationIds: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(destinations, null, 2)};\n`;
}

function stageReplacement(path, contents) {
  const resolved = resolve(path);
  const temporary = resolve(dirname(resolved), `.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  writeFileSync(temporary, contents, { encoding: "utf8", flag: "wx" });
  return { resolved, temporary };
}

function replaceTogether(outputs) {
  const resolvedOutputs = outputs.map((output) => ({ ...output, resolved: resolve(output.path) }));
  if (new Set(resolvedOutputs.map((output) => output.resolved)).size !== resolvedOutputs.length) {
    throw new Error("Northern topology artifacts require two distinct output paths");
  }
  for (const output of resolvedOutputs) {
    try {
      if (!lstatSync(output.resolved).isFile()) {
        throw new Error(`Northern topology output is not a regular file: ${output.path}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const staged = [];
  try {
    for (const output of resolvedOutputs) staged.push(stageReplacement(output.resolved, output.contents));
    for (const output of staged) renameSync(output.temporary, output.resolved);
  } catch (error) {
    for (const output of staged) {
      try {
        unlinkSync(output.temporary);
      } catch (cleanupError) {
        if (cleanupError?.code !== "ENOENT") throw cleanupError;
      }
    }
    throw error;
  }
}

const capture = readCapture(inputPath);
const destinations = directDestinations(capture.topology);
replaceTogether([
  { path: topologyOutput, contents: topologyArtifact(capture) },
  { path: destinationsOutput, contents: destinationsArtifact(capture, destinations) },
]);

const routeCount = capture.topology.reduce((total, item) => total + item.orderedLineRoutes.length, 0);
console.log(`Generated Northern topology captured ${capture.capturedAt}: ${routeCount} routes, ${Object.keys(destinations).length} direct origins.`);
console.log("Review generated changes before committing; nothing was published.");
