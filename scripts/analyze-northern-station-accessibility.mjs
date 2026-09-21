/**
 * Audits the published station dataset and writes a sanitized Northern-only report.
 *
 * The report intentionally contains counts, canonical station IDs, and issue codes
 * only. Free-text accessibility notes, raw dataset paths, and non-Northern records
 * are never copied into the artifact.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [datasetDirectory, outputPath, ...requestedIds] = process.argv.slice(2);

if (!datasetDirectory || !outputPath) {
  throw new Error(
    "Usage: node scripts/analyze-northern-station-accessibility.mjs <dataset-directory> <output.json> [canonical-id...]",
  );
}

const tableRequirements = {
  "FeedInfo.csv": ["FeedPublisherName", "FeedPublisherUrl", "FeedLang", "FeedStartDate"],
  "Stations.csv": [
    "UniqueId",
    "Name",
    "FareZones",
    "HubNaptanCode",
    "Wifi",
    "BlueBadgeCarParking",
    "BlueBadgeCarParkSpaces",
  ],
  "Platforms.csv": [
    "UniqueId",
    "StationUniqueId",
    "AccessibleEntranceName",
    "HasStepFreeRouteInformation",
  ],
  "PlatformServices.csv": [
    "PlatformUniqueId",
    "StopAreaNaptanCode",
    "Line",
    "MinGap",
    "MaxGap",
    "AverageGap",
    "MinStep",
    "MaxStep",
    "AverageStep",
    "DesignatedLevelAccessPoint",
    "LocationOfLevelAccess",
    "LevelAccessByManualRamp",
    "AdditionalAccessibilityInformation",
  ],
  "Lifts.csv": ["StationUniqueId", "LiftUniqueId", "LimitedCapacityLift", "LiftNotes"],
  "Toilets.csv": ["StationUniqueId", "Id", "IsAccessible", "Location", "OpeningHours"],
};

const nullFields = {
  stations: ["FareZones", "Wifi", "BlueBadgeCarParking", "BlueBadgeCarParkSpaces"],
  platforms: ["AccessibleEntranceName", "HasStepFreeRouteInformation"],
  platformServices: [
    "MinGap",
    "MaxGap",
    "AverageGap",
    "MinStep",
    "MaxStep",
    "AverageStep",
    "DesignatedLevelAccessPoint",
    "LocationOfLevelAccess",
    "LevelAccessByManualRamp",
    "AdditionalAccessibilityInformation",
  ],
  lifts: ["LimitedCapacityLift", "LiftNotes"],
  toilets: ["IsAccessible", "Location", "OpeningHours"],
};

const serviceConflictFields = [
  "StopAreaNaptanCode",
  "MinGap",
  "MaxGap",
  "AverageGap",
  "MinStep",
  "MaxStep",
  "AverageStep",
  "DesignatedLevelAccessPoint",
  "LocationOfLevelAccess",
  "LevelAccessByManualRamp",
];

/** Parse RFC 4180-style CSV, including quoted commas, quotes, and newlines. */
function parseCsv(text, fileName) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      if (value.length > 0) throw new Error(`${fileName} contains an invalid quote`);
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.endsWith("\r") ? value.slice(0, -1) : value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error(`${fileName} contains an unterminated quoted field`);
  if (value.length > 0 || row.length > 0) {
    row.push(value.endsWith("\r") ? value.slice(0, -1) : value);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
  if (!nonEmptyRows.length) throw new Error(`${fileName} must include a header row`);
  nonEmptyRows[0][0] = nonEmptyRows[0][0].replace(/^\uFEFF/, "");
  return nonEmptyRows;
}

/** Read one required CSV table and validate its named schema. */
function readTable(fileName, requiredColumns) {
  let text;
  try {
    text = readFileSync(join(datasetDirectory, fileName), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`Missing required dataset file: ${fileName}`);
    }
    throw error;
  }

  const [columns, ...values] = parseCsv(text, fileName);
  const missingColumns = requiredColumns.filter((column) => !columns.includes(column));
  if (missingColumns.length) {
    throw new Error(`${fileName} is missing required columns: ${missingColumns.join(", ")}`);
  }

  return values.map((cells) => Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? ""])));
}

/** Return the app's canonical Northern station identifiers unless tests supply a bounded set. */
function canonicalStationIds() {
  const ids = requestedIds.length
    ? requestedIds
    : [...readFileSync("src/lib/northern/stations.ts", "utf8").matchAll(/"(940GZZ[A-Z0-9]+)"/g)].map(
        (match) => match[1],
      );
  const uniqueIds = [...new Set(ids)].sort();
  if (!uniqueIds.length) throw new Error("At least one canonical Northern station ID is required");
  if (uniqueIds.length !== ids.length) throw new Error("Duplicate canonical Northern station ID requested");
  const invalidId = uniqueIds.find((id) => !/^940GZZ[A-Z0-9]+$/.test(id));
  if (invalidId) throw new Error(`Invalid canonical Northern station ID: ${invalidId}`);
  return uniqueIds;
}

/** Group records without discarding duplicates needed for contradiction checks. */
function groupBy(rows, field) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row[field];
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  return grouped;
}

/** Count blank values without treating absence as false. */
function summarizeNulls(rows, fields) {
  return {
    rowCount: rows.length,
    fields: Object.fromEntries(
      fields.map((field) => [field, rows.filter((row) => !row[field]?.trim()).length]),
    ),
  };
}

const tables = Object.fromEntries(
  Object.entries(tableRequirements).map(([fileName, columns]) => [fileName, readTable(fileName, columns)]),
);
const canonicalIds = canonicalStationIds();
const canonicalIdSet = new Set(canonicalIds);
const northernServices = tables["PlatformServices.csv"].filter(
  (row) => row.Line.trim().toLowerCase() === "northern",
);
const platformRowsById = groupBy(tables["Platforms.csv"], "UniqueId");
const stationRowsById = groupBy(tables["Stations.csv"], "UniqueId");

const northernStationIds = [...new Set(northernServices.map((row) => row.StopAreaNaptanCode))].sort();
const missingCanonicalStationIds = canonicalIds.filter((id) => !northernStationIds.includes(id));
const unexpectedNorthernStationIds = northernStationIds.filter((id) => !canonicalIdSet.has(id));
let missingPlatformJoinCount = 0;
let missingStationJoinCount = 0;
const sourceStationToCanonicalIds = new Map();
const referencedPlatformIds = new Set();

for (const service of northernServices) {
  const platformRows = platformRowsById.get(service.PlatformUniqueId) ?? [];
  if (!platformRows.length) {
    missingPlatformJoinCount += 1;
    continue;
  }
  referencedPlatformIds.add(service.PlatformUniqueId);
  const sourceStationId = platformRows[0].StationUniqueId;
  if (!(stationRowsById.get(sourceStationId) ?? []).length) missingStationJoinCount += 1;
  const ids = sourceStationToCanonicalIds.get(sourceStationId) ?? new Set();
  ids.add(service.StopAreaNaptanCode);
  sourceStationToCanonicalIds.set(sourceStationId, ids);
}

const sourceStationIds = new Set(sourceStationToCanonicalIds.keys());
const northernStations = tables["Stations.csv"].filter((row) => sourceStationIds.has(row.UniqueId));
const northernPlatforms = tables["Platforms.csv"].filter((row) => referencedPlatformIds.has(row.UniqueId));
const northernLifts = tables["Lifts.csv"].filter((row) => sourceStationIds.has(row.StationUniqueId));
const northernToilets = tables["Toilets.csv"].filter((row) => sourceStationIds.has(row.StationUniqueId));
const ambiguousSourceMappings = [...sourceStationToCanonicalIds.values()].filter((ids) => ids.size !== 1);
const unmatchedLiftRowCount = tables["Lifts.csv"].filter(
  (row) => canonicalIdSet.has(row.StationUniqueId) && !sourceStationIds.has(row.StationUniqueId),
).length;
const unmatchedToiletRowCount = tables["Toilets.csv"].filter(
  (row) => canonicalIdSet.has(row.StationUniqueId) && !sourceStationIds.has(row.StationUniqueId),
).length;

const contradictions = [];
const serviceGroups = new Map();
for (const service of northernServices) {
  const key = `${service.PlatformUniqueId}\u0000${service.Line.trim().toLowerCase()}`;
  const group = serviceGroups.get(key) ?? [];
  group.push(service);
  serviceGroups.set(key, group);
}
for (const services of serviceGroups.values()) {
  if (services.length < 2) continue;
  const conflictingFields = serviceConflictFields.filter(
    (field) => new Set(services.map((service) => service[field].trim())).size > 1,
  );
  if (conflictingFields.length) {
    contradictions.push({
      kind: "conflicting-platform-service-record",
      canonicalStationId: services[0].StopAreaNaptanCode,
      fields: conflictingFields,
    });
  }
}

const feedRows = tables["FeedInfo.csv"];
if (feedRows.length !== 1) throw new Error("FeedInfo.csv must contain exactly one data row");
const feed = feedRows[0];
const publisherUrl = (() => {
  try {
    return new URL(feed.FeedPublisherUrl);
  } catch {
    return null;
  }
})();
const attributionReliable =
  feed.FeedPublisherName === "Transport for London" &&
  publisherUrl?.protocol === "https:" &&
  (publisherUrl.hostname === "tfl.gov.uk" || publisherUrl.hostname.endsWith(".tfl.gov.uk")) &&
  Number.isFinite(Date.parse(feed.FeedStartDate));

const joinsReliable =
  missingCanonicalStationIds.length === 0 &&
  unexpectedNorthernStationIds.length === 0 &&
  missingPlatformJoinCount === 0 &&
  missingStationJoinCount === 0 &&
  ambiguousSourceMappings.length === 0 &&
  unmatchedLiftRowCount === 0 &&
  unmatchedToiletRowCount === 0;
const hasHubScopedAncillaryRecords = [...northernLifts, ...northernToilets].some((row) =>
  row.StationUniqueId.startsWith("HUB"),
);
const evidenceGateReasons = [
  "FeedInfo.csv has no explicit last-updated timestamp, feed version, or refresh cadence.",
];
if (hasHubScopedAncillaryRecords) {
  evidenceGateReasons.push(
    "Station-complex lift/toilet rows cannot be attributed to Northern platforms at interchange hubs.",
  );
}
if (!attributionReliable) evidenceGateReasons.push("Publisher attribution or the supplied feed date is malformed.");
if (!joinsReliable) evidenceGateReasons.push("Northern identifier joins are incomplete or ambiguous.");
if (contradictions.length) evidenceGateReasons.push("Contradictory Northern records were found.");

const report = {
  schemaVersion: 1,
  scope: "Northern line only",
  source: {
    publisherName: feed.FeedPublisherName,
    publisherUrl: feed.FeedPublisherUrl,
    language: feed.FeedLang,
    feedStartDate: feed.FeedStartDate,
    attributionReliable,
    freshnessReliable: false,
    dateLimitation:
      "FeedStartDate is publisher supplied but is not asserted to be a last-updated or verified-current timestamp.",
  },
  joins: {
    canonicalStationCount: canonicalIds.length,
    northernServiceStationCount: northernStationIds.length,
    matchedStationCount: canonicalIds.filter((id) => northernStationIds.includes(id)).length,
    missingCanonicalStationIds,
    unexpectedNorthernStationIds,
    northernPlatformServiceRowCount: northernServices.length,
    missingPlatformJoinCount,
    missingStationJoinCount,
    ambiguousSourceStationMappingCount: ambiguousSourceMappings.length,
    unmatchedLiftRowCount,
    unmatchedToiletRowCount,
  },
  nullPatterns: {
    stations: summarizeNulls(northernStations, nullFields.stations),
    platforms: summarizeNulls(northernPlatforms, nullFields.platforms),
    platformServices: summarizeNulls(northernServices, nullFields.platformServices),
    lifts: summarizeNulls(northernLifts, nullFields.lifts),
    toilets: summarizeNulls(northernToilets, nullFields.toilets),
  },
  contradictions,
  evidenceGate: { outcome: "fail", reasons: evidenceGateReasons },
  trustedForDisplay: [],
  prohibitedClaims: [
    "live lift availability",
    "whole-journey step-free status",
    "a step-free route",
    "accessibility confidence",
  ],
  sanitization: {
    excludesNonNorthernRows: true,
    excludesFreeTextFields: ["AdditionalAccessibilityInformation", "LiftNotes", "Location"],
    excludesSourcePaths: true,
  },
};

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote Northern-only accessibility audit: ${report.joins.matchedStationCount}/${report.joins.canonicalStationCount} canonical joins; evidence gate ${report.evidenceGate.outcome}.`,
);
