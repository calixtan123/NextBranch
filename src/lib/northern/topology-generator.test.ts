/** Verifies that one validated capture produces the Northern server and browser topology artifacts. */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { bundledTopology } from "./bundledTopology";
import { directDestinationCapturedAt, directDestinationIds } from "./direct-destination-map";

const root = process.cwd();
const fixture = (name: string) => join(root, "tests/fixtures/northern", name);
const temporaryDirectories: string[] = [];

function generate(input: string) {
  const outputDirectory = mkdtempSync(join(tmpdir(), "northern-topology-"));
  temporaryDirectories.push(outputDirectory);
  const topology = join(outputDirectory, "bundledTopology.ts");
  const destinations = join(outputDirectory, "direct-destination-map.ts");
  return {
    destinations,
    outputDirectory,
    topology,
    run: (destinationsPath = destinations) => execFileSync(
      process.execPath,
      ["scripts/generate-northern-topology.mjs", input, topology, destinationsPath],
      { cwd: root, encoding: "utf8", stdio: "pipe" },
    ),
  };
}

async function readGeneratedModule(path: string) {
  const source = readFileSync(path, "utf8");
  const compiled = transpileModule(source, {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

function destinationsFrom(topology: typeof bundledTopology.topology) {
  const destinations = new Map<string, Set<string>>();
  for (const item of topology) {
    for (const route of item.orderedLineRoutes) {
      route.naptanIds.forEach((origin, index) => {
        const reachable = destinations.get(origin) ?? new Set<string>();
        route.naptanIds.slice(index + 1).forEach((destination) => reachable.add(destination));
        destinations.set(origin, reachable);
      });
    }
  }
  return Object.fromEntries(
    [...destinations]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([origin, reachable]) => [origin, [...reachable].sort()]),
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Northern topology generator", () => {
  // Production defect: unvalidated or non-Northern capture data could overwrite reviewed artifacts.
  it("rejects malformed structured capture data before creating either artifact", () => {
    const command = generate(fixture("topology-capture-invalid.json"));

    expect(command.run).toThrow("Invalid Northern topology capture");
    expect(existsSync(command.topology)).toBe(false);
    expect(existsSync(command.destinations)).toBe(false);
  });

  // Production defect: syntactically malformed JSON could be mistaken for reviewed route evidence.
  it("rejects malformed JSON before creating either artifact", () => {
    const command = generate(fixture("topology-capture-malformed.json"));

    expect(command.run).toThrow("Could not read Northern topology capture");
    expect(existsSync(command.topology)).toBe(false);
    expect(existsSync(command.destinations)).toBe(false);
  });

  // Production defect: one failed output could leave server and browser artifacts on different snapshots.
  it("leaves neither artifact behind when the coordinated write cannot complete", () => {
    const command = generate(fixture("topology-capture-valid.json"));
    const unavailableDestination = join(command.outputDirectory, "missing", "direct-destination-map.ts");

    expect(() => command.run(unavailableDestination)).toThrow();
    expect(existsSync(command.topology)).toBe(false);
    expect(existsSync(command.destinations)).toBe(false);
  });

  // Production defect: a replacement-stage failure could update only the server artifact.
  it("rejects a non-file output target before replacing either artifact", () => {
    const command = generate(fixture("topology-capture-valid.json"));

    expect(() => command.run(command.outputDirectory)).toThrow();
    expect(existsSync(command.topology)).toBe(false);
    expect(existsSync(command.destinations)).toBe(false);
  });

  // Production defect: server topology and browser direct destinations could be generated from separate snapshots.
  it("writes both artifacts with the capture timestamp and reviewed-change summary", async () => {
    const command = generate(fixture("topology-capture-valid.json"));

    const summary = command.run();

    const topology = await readGeneratedModule(command.topology);
    const destinations = await readGeneratedModule(command.destinations);

    expect(topology.bundledTopology.capturedAt).toBe("2026-09-15T21:53:00.000Z");
    expect(destinations.directDestinationCapturedAt).toBe(topology.bundledTopology.capturedAt);
    expect(destinations.directDestinationIds).toEqual({
      "940GZZLUCTN": ["940GZZLUMDN"],
      "940GZZLUMDN": ["940GZZLUCTN"],
    });
    expect(summary.trim().split("\n")).toEqual([
      "Generated Northern topology captured 2026-09-15T21:53:00.000Z: 2 routes, 2 direct origins.",
      "Review generated changes before committing; nothing was published.",
    ]);
    expect(readdirSync(command.outputDirectory).sort()).toEqual([
      "bundledTopology.ts",
      "direct-destination-map.ts",
    ]);
  });

  // Production defect: a committed browser map could become stale while the server snapshot changes.
  it("keeps the tracked source, server topology, and browser destinations consistent", () => {
    const trackedCapture = JSON.parse(
      readFileSync(join(root, "data/northern-topology-capture.json"), "utf8"),
    ) as { capturedAt: string; topology: unknown };

    expect(bundledTopology.capturedAt).toBe(trackedCapture.capturedAt);
    expect(bundledTopology.topology).toEqual(trackedCapture.topology);
    expect(directDestinationCapturedAt).toBe(bundledTopology.capturedAt);
    expect(directDestinationIds).toEqual(destinationsFrom(bundledTopology.topology));
  });
});
