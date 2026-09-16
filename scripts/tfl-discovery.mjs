import { readFile } from "node:fs/promises";

// This is an inspection tool, not part of the application runtime. It emits
// only fields used by the matcher and never prints the app_key or request URL.
const stations = [
  ["Camden Town", "940GZZLUCTN"],
  ["Euston", "940GZZLUEUS"],
  ["Kennington", "940GZZLUKNG"],
  ["Stockwell", "940GZZLUSKW"],
  ["East Finchley", "940GZZLUEFY"],
  ["High Barnet", "940GZZLUHBT"],
  ["Moorgate", "940GZZLUMGT"],
];
const requestedFields = [
  "id", "vehicleId", "naptanId", "lineId", "destinationNaptanId",
  "destinationName", "timestamp", "expectedArrival", "platformName",
  "direction", "towards", "timeToStation",
];
const [fixtureFlag, fixturePath] = process.argv.slice(2);
if (fixtureFlag === "--fixture" && !fixturePath) {
  throw new Error("--fixture requires an explicit JSON path");
}
if (fixtureFlag && fixtureFlag !== "--fixture") {
  throw new Error("Usage: node scripts/tfl-discovery.mjs [--fixture path]");
}

const selectedFields = (record) =>
  Object.fromEntries(requestedFields.flatMap((field) =>
    Object.hasOwn(record ?? {}, field) ? [[field, record[field]]] : []));
const asRecords = (value) => Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];

async function readFixture(path) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  if (Array.isArray(raw)) return { arrivalsByStation: { "Camden Town": raw }, routes: [], timetable: null, cache: {} };
  return {
    arrivalsByStation: raw.arrivalsByStation ?? {},
    routes: Array.isArray(raw.routes) ? raw.routes : [],
    timetable: raw.timetable ?? null,
    cache: raw.cache ?? {},
  };
}

async function getJson(path, options) {
  const key = process.env.TFL_API_KEY;
  if (!key) throw new Error("Set TFL_API_KEY before running discovery.");
  const response = await fetch(`https://api.tfl.gov.uk${path}?app_key=${encodeURIComponent(key)}`, options);
  let body = null;
  try { body = await response.json(); } catch { /* status is still useful for discovery */ }
  return { status: response.status, cacheControl: response.headers.get("cache-control"), body };
}

async function liveCapture() {
  const arrivals = await Promise.all(stations.map(async ([name, id]) => [
    name, await getJson(`/Line/northern/Arrivals/${id}`, { cache: "no-store" }),
  ]));
  const routes = await getJson("/Line/northern/Route/Sequence/all", { next: { revalidate: 43_200 } });
  const timetable = await getJson(`/Line/northern/Timetable/${stations[0][1]}/to/940GZZLUEGW`, { next: { revalidate: 43_200 } });
  return {
    arrivalsByStation: Object.fromEntries(arrivals.map(([name, result]) => [name, result.body])),
    routes: Array.isArray(routes.body) ? routes.body : routes.body ? [routes.body] : [],
    timetable: timetable.body,
    cache: {
      arrivals: Object.fromEntries(arrivals.map(([name, result]) => [name, result.cacheControl])),
      routes: routes.cacheControl,
      timetable: timetable.cacheControl,
      statuses: Object.fromEntries(arrivals.map(([name, result]) => [name, result.status])),
    },
  };
}

const capture = fixturePath ? await readFixture(fixturePath) : await liveCapture();
const stationRows = stations.map(([name, id]) => {
  const source = capture.arrivalsByStation[name] ?? capture.arrivalsByStation[id] ?? [];
  const records = asRecords(source).map(selectedFields);
  return { station: name, id, sampleSize: records.length, records };
});
const vehicleGroups = new Map();
for (const row of stationRows) for (const record of row.records) {
  const vehicle = typeof record.vehicleId === "string" && record.vehicleId.trim() ? record.vehicleId : null;
  if (!vehicle) continue;
  const group = vehicleGroups.get(vehicle) ?? { vehicleId: vehicle, stations: new Set(), destinations: new Set(), branches: new Set(), records: 0 };
  group.stations.add(row.station);
  if (typeof record.destinationNaptanId === "string") group.destinations.add(record.destinationNaptanId);
  if (typeof record.towards === "string") group.branches.add(record.towards);
  group.records++;
  vehicleGroups.set(vehicle, group);
}
const vehicleSummary = [...vehicleGroups.values()].map((group) => ({
  vehicleId: group.vehicleId,
  stations: [...group.stations].sort(),
  recordCount: group.records,
  destinations: [...group.destinations].sort(),
  towardsValues: [...group.branches].sort(),
  conflict: group.destinations.size > 1 || group.branches.size > 1,
}));
const platformFormatDistribution = { exact: 0, directionOnly: 0, malformed: 0, missing: 0 };
const towardsValues = new Set();
const termini = new Set();
for (const row of stationRows) for (const record of row.records) {
  const platform = record.platformName;
  if (typeof platform !== "string" || !platform) platformFormatDistribution.missing++;
  else if (/^(Northbound|Southbound) - Platform [A-Za-z0-9]+$/.test(platform)) platformFormatDistribution.exact++;
  else if (platform === "Northbound" || platform === "Southbound" || record.direction) platformFormatDistribution.directionOnly++;
  else platformFormatDistribution.malformed++;
  if (typeof record.towards === "string") towardsValues.add(record.towards);
  if (typeof record.destinationNaptanId === "string") termini.add(record.destinationNaptanId);
}
const routes = capture.routes.flatMap((topology) => Array.isArray(topology?.orderedLineRoutes) ? topology.orderedLineRoutes : []);
const routeSummary = routes.map((route) => ({ name: route.name ?? null, stationCount: Array.isArray(route.naptanIds) ? route.naptanIds.length : 0, first: route.naptanIds?.[0] ?? null, last: route.naptanIds?.at(-1) ?? null, serviceType: route.serviceType ?? null }));
const timetable = capture.timetable?.timetable;
const timetableRoutes = Array.isArray(timetable?.routes) ? timetable.routes : [];
const timetableMetadata = {
  routeCount: timetableRoutes.length,
  scheduleNames: timetableRoutes.flatMap((route) => route.schedules ?? []).map((schedule) => schedule.name),
  knownJourneyCount: timetableRoutes.reduce((sum, route) => sum + (route.schedules ?? []).reduce((count, schedule) => count + (schedule.knownJourneys ?? []).length, 0), 0),
  intervalCount: timetableRoutes.reduce((sum, route) => sum + (route.stationIntervals ?? []).length, 0),
  sampleIntervals: timetableRoutes.flatMap((route) => route.stationIntervals ?? []).flatMap((interval) => interval.intervals ?? []).slice(0, 20).map((interval) => ({
    stopId: interval.stopId ?? null,
    timeToArrival: interval.timeToArrival ?? null,
    timeToDeparture: interval.timeToDeparture ?? null,
  })),
};
const output = {
  observedAt: new Date().toISOString(),
  source: fixturePath ? { fixture: fixturePath } : { live: true },
  endpoints: { arrivals: "/Line/northern/Arrivals/{station}", routes: "/Line/northern/Route/Sequence/all", timetable: "/Line/northern/Timetable/{from}/to/{to}" },
  requestedFields,
  stations: stationRows,
  vehicleGrouping: { uniqueVehicles: vehicleSummary.length, multiStationVehicles: vehicleSummary.filter((item) => item.stations.length > 1).length, conflicts: vehicleSummary.filter((item) => item.conflict) },
  platformFormatDistribution,
  branchEvidence: { towardsValues: [...towardsValues].sort(), advertisedTermini: [...termini].sort(), routeSequenceCount: routes.length, terminatingPatterns: routeSummary.filter((route) => route.last && route.first).map((route) => ({ name: route.name, first: route.first, last: route.last })) },
  downstreamCoverage: { stationsSampled: stationRows.filter((row) => row.sampleSize > 0).map((row) => row.station), vehiclesSeenAtMultipleStations: vehicleSummary.filter((item) => item.stations.length > 1).length },
  timetableMetadata,
  cacheHeaders: capture.cache,
};
console.log(JSON.stringify(output, null, 2));
