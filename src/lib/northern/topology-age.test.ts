/** Verifies the non-mutating warning and release-failure boundaries for reviewed topology snapshots. */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const fixture = join(root, "tests/fixtures/northern/topology-capture-valid.json");

function check(now: string, release = false) {
  return spawnSync(process.execPath, [
    "scripts/check-topology-age.mjs",
    fixture,
    "--now",
    now,
    ...(release ? ["--release"] : []),
  ], { cwd: root, encoding: "utf8" });
}

describe("Northern topology age check", () => {
  // Production defect: a snapshot could become stale without an early maintenance warning.
  it("starts warning at 23 days but remains non-mutating through the 30-day boundary", () => {
    const before = readFileSync(fixture, "utf8");

    const fresh = check("2026-10-07T21:53:00.000Z");
    const warning = check("2026-10-08T21:53:00.000Z");
    const boundary = check("2026-10-15T21:53:00.000Z");

    expect(fresh.status).toBe(0);
    expect(fresh.stdout).not.toContain("WARNING");
    expect(warning.status).toBe(0);
    expect(warning.stdout).toContain("WARNING: Northern topology snapshot is 23 days old");
    expect(boundary.status).toBe(0);
    expect(boundary.stdout).toContain("WARNING: Northern topology snapshot is 30 days old");
    expect(readFileSync(fixture, "utf8")).toBe(before);
  });

  // Production defect: an expired fallback could pass a release gate and be presented as current route evidence.
  it("fails release verification as soon as the snapshot is more than 30 days old", () => {
    const boundary = check("2026-10-15T21:53:00.000Z", true);
    const justExpired = check("2026-10-15T21:53:00.001Z", true);
    const regularCheck = check("2026-10-16T21:53:00.000Z");
    const releaseCheck = check("2026-10-16T21:53:00.000Z", true);

    expect(boundary.status).toBe(0);
    expect(justExpired.status).toBe(1);
    expect(justExpired.stderr).toContain("EXPIRED: Northern topology snapshot is more than 30 days old (30 full days)");
    expect(regularCheck.status).toBe(0);
    expect(regularCheck.stdout).toContain("WARNING: Northern topology snapshot is 31 days old");
    expect(releaseCheck.status).toBe(1);
    expect(releaseCheck.stderr).toContain("EXPIRED: Northern topology snapshot is more than 30 days old (31 full days)");
  });
});
