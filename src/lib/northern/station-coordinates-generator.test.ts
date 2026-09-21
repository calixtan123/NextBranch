/** Verifies generated station-coordinate validation and canonical artifact output. */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const fixture = (name: string) => join(root, "tests/fixtures/northern", name);
const requiredIds = ["940GZZLUCTN", "940GZZLUAGL"];
const temporaryDirectories: string[] = [];

function generate(input: string) {
  const outputDirectory = mkdtempSync(join(tmpdir(), "northern-coordinates-"));
  temporaryDirectories.push(outputDirectory);
  const output = join(outputDirectory, "station-coordinates.ts");
  return {
    output,
    run: () => execFileSync(
      process.execPath,
      ["scripts/generate-northern-station-coordinates.mjs", input, output, ...requiredIds],
      { cwd: root, encoding: "utf8", stdio: "pipe" },
    ),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Northern coordinate generator", () => {
  // Break: a malformed input produces an unchecked runtime coordinate artifact.
  it.each([
    ["station-points-missing.csv", "Missing coordinate"],
    ["station-points-duplicate.csv", "Duplicate coordinate"],
    ["station-points-non-finite.csv", "Invalid coordinate"],
    ["station-points-out-of-range.csv", "Invalid coordinate"],
  ])("rejects %s with a clear validation error", (input, expectedMessage) => {
    const command = generate(fixture(input));
    expect(command.run).toThrow(expectedMessage);
  });

  // Break: the generated artifact omits a canonical ID or does not preserve reviewed coordinates.
  it("writes one canonical representative coordinate for every requested Northern station", () => {
    const command = generate(fixture("station-points-valid.csv"));
    command.run();

    const artifact = readFileSync(command.output, "utf8");
    expect(artifact).toContain('"id": "940GZZLUAGL"');
    expect(artifact).toContain('"latitude": 51.5318');
    expect(artifact).toContain('"longitude": -0.106');
    expect(artifact).toContain('"id": "940GZZLUCTN"');
    expect(artifact).toContain('"latitude": 51.5393');
    expect(artifact).toContain('"longitude": -0.1427');
  });
});
