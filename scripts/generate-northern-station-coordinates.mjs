/** Generates the reviewed, Northern-only browser coordinate artifact from StationPoints.csv. */
import { readFileSync, writeFileSync } from "node:fs";

const [inputPath, outputPath = "src/lib/northern/station-coordinates.ts", ...requestedIds] = process.argv.slice(2);

// StationPoints uses hub IDs for interchanges while the live departures API uses
// canonical NaPTAN IDs. These reviewed aliases keep the generated artifact on
// the API's canonical IDs without bundling the much larger source dataset.
const sourceIdForCanonicalId = {
  "940GZZLUBLM": "HUBBAL",
  "940GZZLUBNK": "HUBBAN",
  "940GZZLUCHX": "HUBCHX",
  "940GZZLUEAC": "HUBEPH",
  "940GZZLUEUS": "HUBEUS",
  "940GZZLUKSH": "HUBKTN",
  "940GZZLUKSX": "HUBKGX",
  "940GZZLULNB": "HUBLBG",
  "940GZZLUMGT": "HUBZMG",
  "940GZZLUODS": "HUBOLD",
  "940GZZLUTCR": "HUBTCR",
  "940GZZLUWLO": "HUBWAT",
};

if (!inputPath) {
  throw new Error("Usage: node scripts/generate-northern-station-coordinates.mjs <StationPoints.csv> [output.ts] [canonical-id...]");
}

function canonicalIds() {
  if (requestedIds.length) return requestedIds;
  const source = readFileSync("src/lib/northern/stations.ts", "utf8");
  return [...new Set([...source.matchAll(/"(940GZZ[A-Z0-9]+)"/g)].map((match) => match[1]))].sort();
}

function parseCsv(text) {
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const columns = header?.split(",");
  if (!columns) throw new Error("Station point input must include a header row");
  const stationIndex = columns.indexOf("StationUniqueId");
  const areaIndex = columns.indexOf("AreaName");
  const latitudeIndex = columns.indexOf("Lat");
  const longitudeIndex = columns.indexOf("Lon");
  if (stationIndex < 0 || areaIndex < 0 || latitudeIndex < 0 || longitudeIndex < 0) {
    throw new Error("Station point input must include StationUniqueId, AreaName, Lat, and Lon columns");
  }
  return rows.map((row) => {
    const values = row.split(",");
    return {
      id: values[stationIndex] ?? "",
      area: values[areaIndex] ?? "",
      latitude: Number(values[latitudeIndex]),
      longitude: Number(values[longitudeIndex]),
    };
  });
}

function validateCoordinate(id, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error(`Invalid coordinate for ${id}`);
  }
}

const roundCoordinate = (value) => Math.round(value * 1_000_000) / 1_000_000;

const ids = canonicalIds();
if (new Set(ids).size !== ids.length) throw new Error("Duplicate canonical station ID requested");
const canonicalIdBySourceId = new Map(ids.map((id) => [sourceIdForCanonicalId[id] ?? id, id]));
const grouped = new Map(ids.map((id) => [id, []]));

for (const point of parseCsv(readFileSync(inputPath, "utf8"))) {
  const canonicalId = canonicalIdBySourceId.get(point.id);
  if (!canonicalId) continue;
  validateCoordinate(canonicalId, point.latitude, point.longitude);
  grouped.get(canonicalId)?.push(point);
}

const coordinates = ids.map((id) => {
  const allPoints = grouped.get(id) ?? [];
  const northernPlatforms = allPoints.filter((point) => /^nor/i.test(point.area));
  const numberedPlatforms = allPoints.filter((point) => /^p\d+$/i.test(point.area));
  const points = northernPlatforms.length ? northernPlatforms : numberedPlatforms.length ? numberedPlatforms : allPoints;
  if (!points.length) throw new Error(`Missing coordinate for ${id}`);
  const latitude = roundCoordinate(points.reduce((sum, point) => sum + point.latitude, 0) / points.length);
  const longitude = roundCoordinate(points.reduce((sum, point) => sum + point.longitude, 0) / points.length);
  validateCoordinate(id, latitude, longitude);
  return { id, latitude, longitude };
}).sort((left, right) => left.id.localeCompare(right.id));

const seenCoordinates = new Set();
for (const coordinate of coordinates) {
  const key = `${coordinate.latitude},${coordinate.longitude}`;
  if (seenCoordinates.has(key)) throw new Error(`Duplicate coordinate for ${coordinate.id}`);
  seenCoordinates.add(key);
}

const artifact = `/**\n * Generated from reviewed StationPoints.csv representatives; do not send browser coordinates to a server.\n * Run scripts/generate-northern-station-coordinates.mjs with an explicit StationPoints.csv path to refresh.\n */\nexport type NorthernStationCoordinate = Readonly<{ id: string; latitude: number; longitude: number }>;\n\nexport const northernStationCoordinates: readonly NorthernStationCoordinate[] = ${JSON.stringify(coordinates, null, 2)};\n`;
writeFileSync(outputPath, artifact);
