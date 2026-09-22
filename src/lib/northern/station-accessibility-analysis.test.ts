/** Verifies the sanitized, Northern-only station-accessibility analysis command. */

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const fixtureDirectory = join(root, "tests/fixtures/northern/accessibility-dataset");
const requestedIds = ["940GZZLUAGL", "940GZZLUBLM"];
const temporaryDirectories: string[] = [];

type AnalysisReport = {
  scope: string;
  source: {
    publisherName: string;
    publisherUrl: string;
    language: string;
    feedStartDate: string;
    freshnessReliable: boolean;
    metadataIssueCodes: string[];
  };
  joins: {
    canonicalStationCount: number;
    northernServiceStationCount: number;
    matchedStationCount: number;
    missingCanonicalStationIds: string[];
    unexpectedNorthernStationIdCount: number;
    malformedNorthernStationIdCount: number;
    missingPlatformJoinCount: number;
    missingStationJoinCount: number;
    ambiguousPlatformOwnershipCount: number;
  };
  nullPatterns: Record<string, { rowCount: number; fields: Record<string, number> }>;
  contradictions: Array<{ kind: string; canonicalStationId?: string; fields: string[] }>;
  evidenceGate: { outcome: string; reasons: string[] };
  trustedForDisplay: string[];
  prohibitedClaims: string[];
};

function createDataset() {
  const directory = mkdtempSync(join(tmpdir(), "northern-accessibility-"));
  temporaryDirectories.push(directory);
  const datasetDirectory = join(directory, "dataset");
  cpSync(fixtureDirectory, datasetDirectory, { recursive: true });
  return { directory, datasetDirectory, outputPath: join(directory, "report.json") };
}

function analyze(datasetDirectory: string, outputPath: string) {
  execFileSync(
    process.execPath,
    ["scripts/analyze-northern-station-accessibility.mjs", datasetDirectory, outputPath, ...requestedIds],
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  );
  return JSON.parse(readFileSync(outputPath, "utf8")) as AnalysisReport;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Northern station-accessibility analysis", () => {
  // Break: Date silently rolls impossible February dates into March and presents invented source metadata.
  it.each(["2026-02-30T09:14:00Z", "2026-02-29T09:14:00Z", "2100-02-29T09:14:00+01:00"])("rejects impossible calendar date %s", (date) => {
    const paths = createDataset();
    writeFileSync(join(paths.datasetDirectory, "FeedInfo.csv"),
      `FeedPublisherName,FeedPublisherUrl,FeedLang,FeedStartDate\nTransport for London,https://tfl.gov.uk,en,${date}\n`);

    const report = analyze(paths.datasetDirectory, paths.outputPath);

    expect(report.source.feedStartDate).toBe("Unknown");
    expect(report.source.metadataIssueCodes).toEqual(["invalid-feed-start-date"]);
  });

  // Break: calendar validation rejects real leap days or compares UTC components with a local offset date.
  it.each([
    ["2024-02-29T09:14:00Z", "2024-02-29T09:14:00.000Z"],
    ["2000-02-29T00:14:00+01:00", "2000-02-28T23:14:00.000Z"],
  ])("preserves valid leap date %s", (date, expected) => {
    const paths = createDataset();
    writeFileSync(join(paths.datasetDirectory, "FeedInfo.csv"),
      `FeedPublisherName,FeedPublisherUrl,FeedLang,FeedStartDate\nTransport for London,https://tfl.gov.uk,en,${date}\n`);

    const report = analyze(paths.datasetDirectory, paths.outputPath);

    expect(report.source.feedStartDate).toBe(expected);
    expect(report.source.metadataIssueCodes).toEqual([]);
  });

  // Break: CSV quoting or line filtering leaks raw/non-Northern records into the committed report.
  it("parses quoted CSV and emits a sanitized Northern-only report", () => {
    const paths = createDataset();
    const report = analyze(paths.datasetDirectory, paths.outputPath);
    const serialized = JSON.stringify(report);

    expect(report.scope).toBe("Northern line only");
    expect(report.source).toMatchObject({
      publisherName: "Transport for London",
      publisherUrl: "https://tfl.gov.uk",
      language: "en",
      feedStartDate: "2026-08-03T09:14:00.000Z",
      freshnessReliable: false,
      metadataIssueCodes: [],
    });
    expect(serialized).not.toContain("Elsewhere");
    expect(serialized).not.toContain("deliberately excluded");
    expect(serialized).not.toContain(paths.datasetDirectory);
  });

  // Break: hub identifiers or missing relational rows make an incomplete join look complete.
  it("reports canonical, platform, and station join coverage", () => {
    const paths = createDataset();
    const report = analyze(paths.datasetDirectory, paths.outputPath);

    expect(report.joins).toEqual({
      canonicalStationCount: 2,
      northernServiceStationCount: 2,
      matchedStationCount: 2,
      missingCanonicalStationIds: [],
      unexpectedNorthernStationIdCount: 0,
      malformedNorthernStationIdCount: 0,
      northernPlatformServiceRowCount: 2,
      missingPlatformJoinCount: 0,
      missingStationJoinCount: 0,
      ambiguousPlatformOwnershipCount: 0,
      ambiguousSourceStationMappingCount: 0,
      unmatchedLiftRowCount: 0,
      unmatchedToiletRowCount: 0,
    });
  });

  // Break: blanks are silently converted to negative accessibility facts rather than audited as nulls.
  it("counts nulls without interpreting them as false", () => {
    const paths = createDataset();
    const report = analyze(paths.datasetDirectory, paths.outputPath);

    expect(report.nullPatterns.platformServices).toEqual({
      rowCount: 2,
      fields: {
        MinGap: 1,
        MaxGap: 1,
        AverageGap: 2,
        MinStep: 1,
        MaxStep: 1,
        AverageStep: 2,
        DesignatedLevelAccessPoint: 0,
        LocationOfLevelAccess: 1,
        LevelAccessByManualRamp: 0,
        AdditionalAccessibilityInformation: 1,
      },
    });
    expect(report.nullPatterns.stations.fields.BlueBadgeCarParkSpaces).toBe(2);
    expect(report.nullPatterns.toilets.fields.OpeningHours).toBe(1);
  });

  // Break: duplicate source records that disagree are flattened into a seemingly trustworthy fact.
  it("reports contradictory Northern records and fails the evidence gate", () => {
    const paths = createDataset();
    const servicesPath = join(paths.datasetDirectory, "PlatformServices.csv");
    writeFileSync(
      servicesPath,
      `${readFileSync(servicesPath, "utf8").trimEnd()}\nangel-platform,940GZZLUAGL,northern,,,,,,,TRUE,,False,\n`,
    );

    const report = analyze(paths.datasetDirectory, paths.outputPath);

    expect(report.contradictions).toContainEqual({
      kind: "conflicting-platform-service-record",
      canonicalStationId: "940GZZLUAGL",
      fields: ["DesignatedLevelAccessPoint"],
    });
    expect(report.evidenceGate.outcome).toBe("fail");
    expect(report.evidenceGate.reasons).toContain("Contradictory Northern records were found.");
  });

  // Break: an identity disagreement is detected but its field name is removed from the sanitized issue.
  it("names canonical identity contradictions without copying raw notes", () => {
    const paths = createDataset();
    const servicesPath = join(paths.datasetDirectory, "PlatformServices.csv");
    writeFileSync(
      servicesPath,
      `${readFileSync(servicesPath, "utf8").trimEnd()}\nangel-platform,940GZZLUBLM,northern,,,,,,,False,,False,\n`,
    );

    const report = analyze(paths.datasetDirectory, paths.outputPath);

    expect(report.contradictions).toContainEqual({
      kind: "conflicting-platform-service-record",
      canonicalStationId: "940GZZLUAGL",
      fields: ["StopAreaNaptanCode"],
    });
  });

  // Break: malformed metadata and identifiers cross the artifact boundary as credentials or arbitrary text.
  it("allows only normalized source strings into the serialized report", () => {
    const paths = createDataset();
    writeFileSync(
      join(paths.datasetDirectory, "FeedInfo.csv"),
      "FeedPublisherName,FeedPublisherUrl,FeedLang,FeedStartDate\n" +
        "synthetic-publisher-free-text,https://user:synthetic-password@tfl.gov.uk/synthetic-path?token=synthetic-secret#synthetic-fragment,synthetic-language,synthetic-location\n",
    );
    const servicesPath = join(paths.datasetDirectory, "PlatformServices.csv");
    writeFileSync(
      servicesPath,
      readFileSync(servicesPath, "utf8").replace("940GZZLUAGL,northern", "synthetic-private-note,northern"),
    );

    const report = analyze(paths.datasetDirectory, paths.outputPath);
    const serialized = JSON.stringify(report);

    for (const marker of [
      "synthetic-publisher-free-text",
      "synthetic-password",
      "synthetic-secret",
      "synthetic-path",
      "synthetic-fragment",
      "synthetic-language",
      "synthetic-location",
      "synthetic-private-note",
      "Published note, deliberately excluded",
      "Ticket hall, beside gate",
    ]) {
      expect(serialized).not.toContain(marker);
    }
    expect(report.source).toMatchObject({
      publisherName: "Unknown",
      publisherUrl: "Unknown",
      language: "Unknown",
      feedStartDate: "Unknown",
      metadataIssueCodes: [
        "invalid-publisher-name",
        "unsafe-publisher-url",
        "unsupported-language",
        "invalid-feed-start-date",
      ],
    });
    expect(report.joins).toMatchObject({
      unexpectedNorthernStationIdCount: 1,
      malformedNorthernStationIdCount: 1,
    });
  });

  // Break: duplicate platform records silently choose station ownership according to CSV row order.
  it("reports conflicting platform ownership deterministically and makes joins unreliable", () => {
    const first = createDataset();
    const second = createDataset();
    const header = "UniqueId,StationUniqueId,AccessibleEntranceName,HasStepFreeRouteInformation";
    const angel = "angel-platform,940GZZLUAGL,,TRUE";
    const conflict = "angel-platform,HUBBAL,,TRUE";
    const remaining = [
      "balham-platform,HUBBAL,North entrance,TRUE",
      "other-platform,940GZZLUXXX,,FALSE",
    ];
    writeFileSync(join(first.datasetDirectory, "Platforms.csv"), [header, angel, conflict, ...remaining, ""].join("\n"));
    writeFileSync(join(second.datasetDirectory, "Platforms.csv"), [header, conflict, angel, ...remaining, ""].join("\n"));

    const firstReport = analyze(first.datasetDirectory, first.outputPath);
    const reversedReport = analyze(second.datasetDirectory, second.outputPath);

    expect(firstReport).toEqual(reversedReport);
    expect(firstReport.joins.ambiguousPlatformOwnershipCount).toBe(1);
    expect(firstReport.contradictions).toContainEqual({
      kind: "conflicting-platform-station-ownership",
      canonicalStationId: "940GZZLUAGL",
      fields: ["StationUniqueId"],
    });
    expect(firstReport.evidenceGate.reasons).toContain(
      "Northern identifier joins are incomplete or ambiguous.",
    );
  });

  // Break: an incomplete export produces a partial report instead of a clear file error.
  it("fails clearly when a required dataset file is absent", () => {
    const paths = createDataset();
    unlinkSync(join(paths.datasetDirectory, "Lifts.csv"));

    expect(() => analyze(paths.datasetDirectory, paths.outputPath)).toThrow(
      "Missing required dataset file: Lifts.csv",
    );
  });

  // Break: a changed source schema shifts values into the wrong facts without detection.
  it("fails clearly when required columns are absent", () => {
    const paths = createDataset();
    writeFileSync(join(paths.datasetDirectory, "FeedInfo.csv"), "FeedPublisherName,FeedPublisherUrl\nTransport for London,https://tfl.gov.uk\n");

    expect(() => analyze(paths.datasetDirectory, paths.outputPath)).toThrow(
      "FeedInfo.csv is missing required columns: FeedLang, FeedStartDate",
    );
  });

  // Break: missing freshness evidence is treated as sufficient to publish a station card.
  it("records the no-UI evidence decision and prohibited claims", () => {
    const paths = createDataset();
    const report = analyze(paths.datasetDirectory, paths.outputPath);

    expect(report.evidenceGate).toEqual({
      outcome: "fail",
      reasons: [
        "FeedInfo.csv has no explicit last-updated timestamp, feed version, or refresh cadence.",
        "Station-complex lift/toilet rows cannot be attributed to Northern platforms at interchange hubs.",
      ],
    });
    expect(report.trustedForDisplay).toEqual([]);
    expect(report.prohibitedClaims).toEqual([
      "live lift availability",
      "whole-journey step-free status",
      "a step-free route",
      "accessibility confidence",
    ]);
  });
});
