/** Compare offline TfL captures through the application's arrival and platform rules. */
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import { ZodError } from "zod";

const MANIFEST = "tfl-arrival-capture/v1";
const CANDIDATES = ["line", "mode", "all_lines_at_stop"];
const MAX_BRACKET_SECONDS = 15;
const IMMINENT_SECONDS = [30, 300];
const ETA_ALERT_SECONDS = 15;
const LINE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const LEGACY_MODE_LINES = Symbol("upstream line IDs from the legacy mode probe");
const USAGE = [
  "Usage: node scripts/compare-tfl-arrivals.mjs [--line <TfL line ID>] <capture>...",
  "Reads NB-58 JSON and public JSONL, optionally gzip-compressed. Public JSONL requires --line.",
  "Writes one JSON line per file, line and candidate. All comparisons use offline capture data.",
].join("\n");

// Resolve the app's extensionless imports and load its TypeScript and JSON in Node 24.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    let result;
    try {
      result = nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".")) throw error;
      result = nextResolve(`${specifier}.ts`, context);
    }
    if (result.url.endsWith(".json")) {
      return { ...result, importAttributes: { ...result.importAttributes, type: "json" } };
    }
    if (result.url.endsWith(".ts")) return { ...result, format: "module-typescript" };
    return result;
  },
});
const { parseArrivals } = await import("../src/lib/northern/schemas.ts");
const { normalizeRailPredictions } = await import("../src/lib/rail/departures.ts");
const { catalogue } = await import("../src/lib/catalogue/index.ts");
const { physicalPlatformForTrain } = await import("../src/lib/catalogue/capability.ts");
const { displayCountdown, remainingSeconds } = await import("../src/lib/northern/time.ts");
hooks.deregister();

function timestamp(value) {
  return typeof value === "string" && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)
    ? Date.parse(value)
    : NaN;
}

function describe(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const at = q => sorted.length ? sorted[Math.ceil(q * sorted.length) - 1] : null;
  return { count: sorted.length, median: at(0.5), p95: at(0.95), max: at(1) };
}

function retryAfter(value) {
  if (typeof value !== "string") return null;
  const utcDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(timestamp(value));
  return /^\d{1,10}$/.test(value) || utcDate ? value : null;
}

function captureStopReason(value) {
  if (value === "Rolling available-headroom budget reached. Review budget before resuming.") return value;
  if (typeof value !== "string") return null;
  const cooldown = /^TfL returned 429\. Retry-After: (.+)\. Stop and review cooldown and shared-key budget before resuming\.$/.exec(value)?.[1];
  return cooldown === "not supplied" || retryAfter(cooldown) ? value : null;
}

function capturedLines(row) {
  const lines = row?.observedLines;
  return Array.isArray(lines) && lines.every(line => typeof line === "string" && LINE_ID.test(line))
    ? lines
    : null;
}

/** Recover upstream line IDs from the legacy probe's positive record counts. */
function legacyModeLines(counts) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return [];
  return Object.entries(counts)
    .filter(([line, count]) => LINE_ID.test(line) && Number.isSafeInteger(count) && count > 0)
    .map(([line]) => line);
}

function readWindow(file, lineId) {
  const bytes = readFileSync(file);
  const payload = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString("utf8");
  if (!/\.jsonl(?:\.gz)?$/i.test(file)) {
    const value = JSON.parse(payload);
    if (value?.format !== MANIFEST || !Array.isArray(value.triads)) {
      throw new Error(`Expected ${MANIFEST} JSON or a public .jsonl/.jsonl.gz file`);
    }
    const brackets = value.triads.map((triad, slot) => {
      if (!triad?.lineId || !triad.stopAreaId || !Array.isArray(triad.samples)) {
        throw new Error(`Invalid manifest bracket at index ${slot}`);
      }
      return { ...triad, slot };
    });
    return {
      format: MANIFEST, brackets, capturedAt: value.capturedAt ?? null,
      captureStopped: Boolean(value.stopped), captureStopReason: captureStopReason(value.stopped?.reason),
      rows: brackets.flatMap(triad => triad.samples),
    };
  }

  if (!lineId) throw new Error("Public JSONL requires --line <TfL line ID>");
  const rows = payload.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSONL at line ${index + 1}`);
    }
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Expected a JSON object at line ${index + 1}`);
    }
    if (row.kind === "stop") return [{ ...row, kind: "stop-reference" }];
    if (!row.kind && Array.isArray(row[lineId])) {
      const records = row[lineId];
      // The probe kept only Northern predictions. Its counts cannot validate discarded arrivals.
      return [{
        ...row, kind: "mode", records, bodyKind: records.length ? "arrivals" : "unknown",
        [LEGACY_MODE_LINES]: legacyModeLines(row.counts),
      }];
    }
    if (!CANDIDATES.includes(row.kind) && !["before", "after"].includes(row.kind)) {
      throw new Error(`Unsupported public sample kind at line ${index + 1}`);
    }
    return [row];
  });

  // Cadence and capacity-only rows count as attempts, but have no reference bracket.
  const slots = Map.groupBy(rows.filter(row => row.slot != null), row => row.slot);
  const brackets = [...slots].flatMap(([slot, samples]) => {
    const stops = [...new Set(samples.map(row => row.stopAreaId).filter(Boolean))];
    if (!stops.length && !samples.some(row => ["before", "after"].includes(row.kind))) return [];
    if (samples.every(row => row.kind === "stop-reference")) return [];
    return [{
      slot, lineId, stopAreaId: stops[0], conflictingStops: stops.length > 1, samples,
    }];
  });
  return { format: "public-jsonl", brackets, capturedAt: null, captureStopped: false, captureStopReason: null, rows };
}

function prepare(row, format) {
  const start = timestamp(row?.startedAt);
  const end = timestamp(row?.completedAt);
  const validTime = Number.isFinite(start) && Number.isFinite(end) && end >= start;
  let predictions = null;
  let parseMs = null;
  const nonEmptyArrivalBody = ["arrivals", "arrivals-with-invalid-records"].includes(row?.bodyKind);
  // The bracketed public mode capture saves the body kind before projecting records to one line and stop.
  const emptyModeProjection = format === "public-jsonl" && row?.kind === "mode" &&
    nonEmptyArrivalBody && Number.isInteger(row.slot) && typeof row.stopAreaId === "string" &&
    row.stopAreaId.length > 0 && (capturedLines(row)?.length ?? 0) > 0;
  if (row?.status === 200 && (nonEmptyArrivalBody || row.bodyKind === "empty") &&
      Array.isArray(row.records) &&
      (emptyModeProjection || (row.bodyKind === "empty") === (row.records.length === 0))) {
    const parseStart = performance.now();
    try {
      predictions = parseArrivals(row.records);
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
    }
    parseMs = performance.now() - parseStart;
  }
  return { row, start, end, validTime, predictions, parseMs };
}

function responseStats(samples) {
  const statusCounts = {};
  const retryAfterValues = new Set();
  const observedLines = new Set();
  let unknownUsabilityAttempts = 0;
  for (const { row, predictions } of samples) {
    const code = Number.isInteger(row?.status) ? row.status : "unknown";
    statusCounts[code] = (statusCounts[code] ?? 0) + 1;
    const retry = retryAfter(row?.retryAfter);
    if (retry !== null) retryAfterValues.add(retry);
    const legacyLines = row?.[LEGACY_MODE_LINES];
    const savedLines = predictions?.map(prediction => prediction.lineId) ?? [];
    if (legacyLines && code === 200 && predictions === null) unknownUsabilityAttempts++;
    const lines = legacyLines ? [...legacyLines, ...savedLines] : capturedLines(row) ?? savedLines;
    for (const line of lines) {
      observedLines.add(line);
    }
  }
  return {
    attempts: samples.length,
    statusCounts,
    retryAfterValues: [...retryAfterValues],
    observedLines: [...observedLines].sort(),
    usableAttempts: samples.filter(sample => sample.predictions !== null).length,
    unknownUsabilityAttempts,
    fetchMs: {
      capturedDuration: describe(samples.flatMap(({ row }) =>
        Number.isFinite(row?.durationMs) && row.durationMs >= 0 ? [row.durationMs] : [])),
      wallClockElapsed: describe(samples.flatMap(sample =>
        sample.validTime ? [sample.end - sample.start] : [])),
    },
    offlineParseMs: describe(samples.flatMap(sample => sample.parseMs === null ? [] : [sample.parseMs])),
  };
}

function inImminentWindow(seconds) {
  return seconds >= IMMINENT_SECONDS[0] && seconds <= IMMINENT_SECONDS[1];
}

function normalize(sample, lineId, stop, clock) {
  const groups = new Map();
  const imminent = new Map();
  const station = catalogue.stationsByAnyId.get(stop);
  const ignored = {
    invalid: sample.row.records.length - sample.predictions.length,
    outsideLineOrStop: 0,
    rejectedByApp: 0,
    unidentified: 0,
  };
  for (const prediction of sample.predictions) {
    if (prediction.naptanId !== stop || prediction.lineId !== lineId) {
      ignored.outsideLineOrStop++;
      continue;
    }
    // A single-record normalization preserves identity collisions for ambiguity checks.
    const [train] = normalizeRailPredictions([prediction], clock);
    if (!train) {
      ignored.rejectedByApp++;
      continue;
    }
    const seconds = (timestamp(prediction.expectedArrival) - clock.getTime()) / 1000;
    const isImminent = inImminentWindow(seconds);
    const vehicle = prediction.vehicleId?.trim();
    const destination = prediction.destinationNaptanId?.trim();
    const direction = prediction.direction?.trim();
    if (!vehicle || vehicle === "000" || !destination || !direction) {
      if (isImminent) ignored.unidentified++;
      continue;
    }
    const key = JSON.stringify([stop, vehicle, destination, direction]);
    const records = groups.get(key) ?? [];
    records.push({
      train,
      physicalPlatformId: station ? physicalPlatformForTrain(station, train) : null,
      branch: train.branch ?? null,
    });
    groups.set(key, records);
    if (isImminent) {
      const relevant = imminent.get(key) ?? [];
      relevant.push(records.at(-1));
      imminent.set(key, relevant);
    }
  }
  return { groups, imminent, ignored };
}

function compareField(references, candidate) {
  if (!candidate || references.some(value => !value)) return "unknown";
  return references.includes(candidate) ? "agrees" : "differs";
}

function compareMatch(references, pick, clock) {
  const arrivals = [...references, pick].map(row => row.train.expectedArrival);
  const [left, right, candidate] = arrivals.map(timestamp);
  const countdown = arrival => displayCountdown(remainingSeconds(arrival, clock));
  return {
    etaOutside: Math.max(Math.min(left, right) - candidate, candidate - Math.max(left, right), 0) / 1000,
    countdownDiffers: arrivals.slice(0, 2).every(arrival => countdown(arrival) !== countdown(arrivals[2])),
    platform: compareField(references.map(row => row.physicalPlatformId), pick.physicalPlatformId),
    branch: compareField(references.map(row => row.branch), pick.branch),
    destinationDiffers: references.every(row => row.train.destinationName !== pick.train.destinationName),
    arrivals,
  };
}

function excludeBracket(bracket, samplesByKind) {
  if (!bracket.stopAreaId || bracket.conflictingStops) return "invalid-stop";
  if (samplesByKind.some(samples => samples.length > 1)) return "duplicate-sample";
  if (samplesByKind.some(samples => samples.length === 0)) return "incomplete";
  const [before, middle, after] = samplesByKind.map(([sample]) => sample);
  if ([before, middle, after].some(sample => sample.predictions === null)) return "unusable-response";
  if ([before, middle, after].some(sample => !sample.validTime)) return "invalid-time";
  if (before.end > middle.start || middle.end > after.start) return "out-of-order";
  if (after.end - before.start > MAX_BRACKET_SECONDS * 1000) return "overlong";
  return null;
}

function countCoverage(comparisons) {
  const result = { eligible: comparisons.length, matched: 0, missing: 0, ambiguous: 0 };
  for (const comparison of comparisons) result[comparison.verdict]++;
  return result;
}

function summarizeCandidate(window, file, lineId, candidate, brackets, allSamples) {
  const distinct = new Map();
  const repeated = [];
  const phases = ["before", "candidate", "after"];
  const ignoredRecords = { ambiguousReferencePairs: 0, outsideLineOrStop: {}, invalid: {}, rejectedByApp: {}, unidentified: {} };
  for (const phase of phases) {
    for (const key of ["outsideLineOrStop", "invalid", "rejectedByApp", "unidentified"]) ignoredRecords[key][phase] = 0;
  }
  const excluded = [];
  const stationStats = new Map();
  const candidateOnly = [];
  const bracketCandidates = new Set();
  for (const bracket of brackets) {
    const { slot, stopAreaId: stop, samples } = bracket;
    const byKind = ["before", candidate, "after"].map(kind => samples.filter(sample => sample.row?.kind === kind));
    for (const sample of byKind[1]) bracketCandidates.add(sample);
    const reason = excludeBracket(bracket, byKind);
    if (reason) {
      excluded.push({ slot, stop: stop ?? null, reason, status: byKind.map(list => list.map(sample => sample.row.status ?? null)) });
      continue;
    }
    const selected = byKind.map(([sample]) => sample);
    const middle = selected[1];
    const clock = new Date(middle.end);
    const [before, compared, after] = selected.map((sample, index) => {
      const normalized = normalize(sample, lineId, stop, clock);
      for (const [key, value] of Object.entries(normalized.ignored)) ignoredRecords[key][phases[index]] += value;
      return normalized;
    });
    const stats = stationStats.get(stop) ?? { included: 0, comparisons: [], candidateLines: new Set() };
    stats.included++;
    for (const row of middle.predictions) {
      if (row.naptanId === stop) stats.candidateLines.add(row.lineId);
    }
    stationStats.set(stop, stats);
    for (const [key, baseFirst] of before.imminent) {
      const baseAfter = after.imminent.get(key);
      if (!baseAfter) continue;
      if (baseFirst.length !== 1 || baseAfter.length !== 1) {
        ignoredRecords.ambiguousReferencePairs++;
        continue;
      }
      const seen = compared.groups.get(key) ?? [];
      const comparison = { key: JSON.parse(key), slot, stop, asOf: middle.row.completedAt };
      if (seen.length === 1) {
        comparison.verdict = "matched";
        Object.assign(comparison, compareMatch([baseFirst[0], baseAfter[0]], seen[0], clock));
      } else {
        comparison.verdict = seen.length ? "ambiguous" : "missing";
      }
      if (!distinct.has(key)) distinct.set(key, comparison);
      repeated.push(comparison);
      stats.comparisons.push(comparison);
    }
    for (const [key, records] of compared.imminent) {
      if (!before.imminent.has(key) && !after.imminent.has(key)) {
        candidateOnly.push({
          slot, key: JSON.parse(key), exactIdentities: records.length,
          referenceExistsOutsideImminent: before.groups.has(key) || after.groups.has(key),
        });
      }
    }
  }

  const attempts = allSamples.filter(sample => sample.row?.kind === candidate);
  const unique = [...distinct.values()];
  const matched = repeated.filter(item => item.verdict === "matched");
  const times = allSamples.filter(sample => sample.validTime);
  const first = times.reduce((earliest, sample) => sample.start < earliest.start ? sample : earliest, times[0]);
  const last = times.reduce((latest, sample) => sample.end > latest.end ? sample : latest, times[0]);
  return {
    file, format: window.format, lineId, candidate,
    capturedAt: window.capturedAt, captureStopped: window.captureStopped, captureStopReason: window.captureStopReason,
    actualInterval: [first?.row.startedAt ?? null, last?.row.completedAt ?? null],
    methodology: {
      clock: "Candidate completion, applied to all three snapshots",
      maximumBracketSeconds: MAX_BRACKET_SECONDS,
      imminentReferenceSeconds: IMMINENT_SECONDS,
      deduplication: "Distinct coverage and ETA use the first eligible comparison per exact stop, vehicle, destination and direction in capture order, within this file, line and candidate. Repeat metrics keep each bracket. Reference uniqueness uses imminent normalized rows in each reference snapshot. Candidate uniqueness uses all normalized rows in the candidate snapshot.",
      percentiles: "Nearest rank (ceil(q * N)) at observed precision. Null when there are no observations.",
      fetchTiming: "Saved durationMs and elapsed saved timestamps are reported separately; saved values may include response handling and decoding",
      parseTiming: "Local app schema parsing of saved HTTP 200 arrival arrays (including rejected arrays), excluding file decoding and normalization",
      observedLines: "Use saved upstream observedLines when present, or lines in parsed saved records. Legacy mode includes line IDs from validated positive upstream counts and parsed saved records. Station candidate lines use saved records for that exact stop.",
      usability: "Legacy mode HTTP 200 attempts without a validated saved arrival have unknown usability.",
      disagreements: "Candidate differs from both references. Countdown uses the board's formatting at candidate completion. Platform or branch is unknown if any of the three values is unresolved",
      etaOutsideThresholdSeconds: ETA_ALERT_SECONDS,
    },
    totalCaptureAttempts: window.rows.length,
    ...responseStats(attempts),
    referenceResponses: Object.fromEntries(["before", "after"].map(kind => [
      kind, responseStats(allSamples.filter(sample => sample.row?.kind === kind)),
    ])),
    bracketCount: brackets.length,
    unbracketedAttempts: attempts.length - bracketCandidates.size,
    stationCount: new Set([...stationStats.keys()].map(stop =>
      catalogue.stationsByAnyId.get(stop)?.station_id ?? stop)).size,
    stopAreaCount: stationStats.size,
    coverage: countCoverage(unique),
    repeatedCoverage: countCoverage(repeated),
    matchesOutside15Seconds: matched.filter(row => row.etaOutside > ETA_ALERT_SECONDS).length,
    distinctFirstEtaOutside: describe(unique.filter(row => row.verdict === "matched").map(row => row.etaOutside)),
    repeatedEtaOutside: describe(matched.map(row => row.etaOutside)),
    minuteCountdownDiffers: matched.filter(row => row.countdownDiffers).length,
    platformDiffers: matched.filter(row => row.platform === "differs").length,
    platformUnresolved: matched.filter(row => row.platform === "unknown").length,
    branchDiffers: matched.filter(row => row.branch === "differs").length,
    branchUnresolved: matched.filter(row => row.branch === "unknown").length,
    destinationDiffers: matched.filter(row => row.destinationDiffers).length,
    excluded, ignoredRecords, candidateOnly,
    mismatchExamples: [...matched].sort((a, b) => b.etaOutside - a.etaOutside).slice(0, 3),
    stationStats: Object.fromEntries([...stationStats].map(([stop, stats]) => [
      stop, { included: stats.included, coverage: countCoverage(stats.comparisons), candidateLines: [...stats.candidateLines].sort() },
    ])),
  };
}

function replay(file, requestedLine) {
  const window = readWindow(file, requestedLine);
  const prepared = new Map(window.rows.map(row => [row, prepare(row, window.format)]));
  const lines = window.format === MANIFEST
    ? [...new Set(window.brackets.map(bracket => bracket.lineId))].filter(line => !requestedLine || line === requestedLine)
    : [requestedLine];
  if (!lines.length) throw new Error("Capture has no brackets for the requested line");

  for (const lineId of lines) {
    const brackets = window.brackets.filter(bracket => bracket.lineId === lineId)
      .map(bracket => ({ ...bracket, samples: bracket.samples.map(row => prepared.get(row)) }));
    const samples = window.format === MANIFEST
      ? brackets.flatMap(bracket => bracket.samples)
      : window.rows.map(row => prepared.get(row));
    const candidates = CANDIDATES.filter(candidate => samples.some(sample => sample.row?.kind === candidate));
    if (window.format === MANIFEST && !candidates.includes("line")) candidates.unshift("line");
    if (!candidates.length && brackets.length) candidates.push("unrecorded");
    if (!candidates.length && samples.some(sample => sample.row?.kind === "stop-reference")) candidates.push("stop-reference");
    if (!candidates.length) throw new Error("Capture has no supported candidate samples");
    for (const candidate of candidates) {
      console.log(JSON.stringify(summarizeCandidate(window, file, lineId, candidate, brackets, samples)));
    }
  }
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { line: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) {
    console.log(USAGE);
  } else {
    if (!positionals.length || values.line === "") throw new Error(USAGE);
    for (const file of positionals) {
      try {
        replay(file, values.line);
      } catch (error) {
        throw new Error(`${file}: ${error.message}`, { cause: error });
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
