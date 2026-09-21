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
const canonicalStationIdPattern = /^940GZZ[A-Z0-9]+$/;
const unknownSourceValue = "Unknown";

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
  const invalidId = uniqueIds.find((id) => !canonicalStationIdPattern.test(id));
  if (invalidId) throw new Error(`Invalid canonical Northern station ID: ${invalidId}`);
  return uniqueIds;
}

/** Return a canonical station ID only when it belongs to the requested app set. */
function safeCanonicalStationId(rows, canonicalIdSet) {
  return rows
    .map((row) => row.StopAreaNaptanCode)
    .filter((id) => canonicalStationIdPattern.test(id) && canonicalIdSet.has(id))
    .sort()[0];
}

/** Normalize the small, allowlisted metadata surface that may enter the artifact. */
function normalizeSourceMetadata(feed) {
  const metadataIssueCodes = [];
  const publisherName = feed.FeedPublisherName.trim() === "Transport for London"
    ? "Transport for London"
    : unknownSourceValue;
  if (publisherName === unknownSourceValue) metadataIssueCodes.push("invalid-publisher-name");

  let publisherUrl = unknownSourceValue;
  try {
    const candidate = new URL(feed.FeedPublisherUrl.trim());
    const allowedHostnames = new Set(["tfl.gov.uk", "api.tfl.gov.uk"]);
    const safe =
      candidate.protocol === "https:" &&
      allowedHostnames.has(candidate.hostname) &&
      candidate.port === "" &&
      candidate.username === "" &&
      candidate.password === "" &&
      candidate.pathname === "/" &&
      candidate.search === "" &&
      candidate.hash === "";
    if (safe) publisherUrl = `https://${candidate.hostname}`;
  } catch {
    // Invalid URLs are represented by a fixed value and issue code below.
  }
  if (publisherUrl === unknownSourceValue) metadataIssueCodes.push("unsafe-publisher-url");

  const language = feed.FeedLang.trim().toLowerCase() === "en" ? "en" : unknownSourceValue;
  if (language === unknownSourceValue) metadataIssueCodes.push("unsupported-language");

  const rawDate = feed.FeedStartDate.trim();
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  const parsedDate = timestampPattern.test(rawDate) ? new Date(rawDate) : null;
  const feedStartDate = parsedDate && Number.isFinite(parsedDate.getTime())
    ? parsedDate.toISOString()
    : unknownSourceValue;
  if (feedStartDate === unknownSourceValue) metadataIssueCodes.push("invalid-feed-start-date");

  return { publisherName, publisherUrl, language, feedStartDate, metadataIssueCodes };
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
const malformedNorthernStationIdCount = northernStationIds.filter(
  (id) => !canonicalStationIdPattern.test(id),
).length;
let missingPlatformJoinCount = 0;
let missingStationJoinCount = 0;
const sourceStationToCanonicalIds = new Map();
const referencedPlatformIds = new Set();
const ambiguousPlatformIds = new Set();

for (const service of northernServices) {
  const platformRows = platformRowsById.get(service.PlatformUniqueId) ?? [];
  if (!platformRows.length) {
    missingPlatformJoinCount += 1;
    continue;
  }
  referencedPlatformIds.add(service.PlatformUniqueId);
  const stationOwners = new Set(platformRows.map((row) => row.StationUniqueId));
  if (stationOwners.size !== 1) {
    ambiguousPlatformIds.add(service.PlatformUniqueId);
    continue;
  }
  const [sourceStationId] = stationOwners;
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
    const canonicalStationId = safeCanonicalStationId(services, canonicalIdSet);
    contradictions.push({
      kind: "conflicting-platform-service-record",
      ...(canonicalStationId ? { canonicalStationId } : {}),
      fields: conflictingFields,
    });
  }
}

for (const platformId of [...ambiguousPlatformIds].sort()) {
  const services = northernServices.filter((service) => service.PlatformUniqueId === platformId);
  const canonicalStationId = safeCanonicalStationId(services, canonicalIdSet);
  contradictions.push({
    kind: "conflicting-platform-station-ownership",
    ...(canonicalStationId ? { canonicalStationId } : {}),
    fields: ["StationUniqueId"],
  });
}
contradictions.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

const feedRows = tables["FeedInfo.csv"];
if (feedRows.length !== 1) throw new Error("FeedInfo.csv must contain exactly one data row");
const feed = feedRows[0];
const sourceMetadata = normalizeSourceMetadata(feed);
const attributionReliable = sourceMetadata.metadataIssueCodes.length === 0;

const joinsReliable =
  missingCanonicalStationIds.length === 0 &&
  unexpectedNorthernStationIds.length === 0 &&
  missingPlatformJoinCount === 0 &&
  missingStationJoinCount === 0 &&
  ambiguousPlatformIds.size === 0 &&
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
    ...sourceMetadata,
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
    unexpectedNorthernStationIdCount: unexpectedNorthernStationIds.length,
    malformedNorthernStationIdCount,
    northernPlatformServiceRowCount: northernServices.length,
    missingPlatformJoinCount,
    missingStationJoinCount,
    ambiguousPlatformOwnershipCount: ambiguousPlatformIds.size,
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
