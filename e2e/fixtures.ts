/** Complete API snapshots and isolated browser state; no request reaches TfL. */
import { expect, test as base } from "@playwright/test";
import type { DeparturesResponse } from "../src/lib/departure-view";
import type { JourneyResponse, JourneyTrain } from "../src/lib/journey-view";
import type { Train } from "../src/lib/northern/predictions";

export const NOW = "2026-09-18T12:00:00.000Z";
export const STATION_URL = "/?station=940GZZLUCTN";
export const JOURNEY_URL = "/?from=940GZZLUCTN&to=940GZZLUEGW";

const train: Train & JourneyTrain = {
  id: "train-101",
  vehicleId: "101",
  lineId: "northern",
  canonicalTerminus: "940GZZLUEGW",
  destinationName: "Edgware",
  expectedArrival: "2026-09-18T12:02:00.000Z",
  timestamp: NOW,
  secondsToOrigin: 120,
  platform: "1",
  direction: "Northbound",
  platformConfirmed: true,
  branch: null,
  towards: "Edgware",
  routeConfidence: "confirmed",
  servicePatternId: "fixture-edgware",
  destinationArrival: "2026-09-18T12:22:00.000Z",
  destinationSeconds: 1320,
  evidence: "live",
  strength: "live",
  via: null,
};

const journey: JourneyResponse = {
  journey: { from: "940GZZLUCTN", to: "940GZZLUEGW" },
  observedAt: NOW,
  predictionGeneratedAt: NOW,
  refreshAfterSeconds: 30,
  trains: [train],
  additionalSuitableCount: 0,
  withheldAmbiguousCount: 0,
  nextTrainId: "train-101",
  fastestTrainId: "train-101",
  qualification: "best_arrival",
  rankings: "best_arrival",
  minutesSaved: null,
};

const departures: DeparturesResponse = {
  station: { id: "940GZZLUCTN", name: "Camden Town" },
  observedAt: NOW,
  newestPredictionGeneratedAt: NOW,
  refreshAfterSeconds: 30,
  platforms: [
    {
      platform: "1", direction: "Northbound",
      departures: [{ id: "train-101", destinationName: "Edgware", expectedArrival: "2026-09-18T12:02:00.000Z", secondsToStation: 120, towards: "Edgware" }],
    },
    {
      platform: null, direction: "Southbound",
      departures: [{ id: "train-202", destinationName: "Battersea Power Station via Charing Cross", expectedArrival: "2026-09-18T12:04:00.000Z", secondsToStation: 240, towards: "Battersea Power Station via Charing Cross" }],
    },
  ],
};

type ApiState = { mode: "live" | "unavailable" | "empty" };

// Playwright creates a fresh context (cookies and localStorage) for each test.
// Do not clear storage on every navigation: the saved-route test checks persistence.
export const test = base.extend<{ api: ApiState }>({
  api: [async ({ context, page, baseURL }, use) => {
    const api: ApiState = { mode: "live" };
    const unexpected: string[] = [];
    await page.clock.setFixedTime(new Date(NOW));
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== baseURL) {
        unexpected.push(`${url.origin}${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
      if (!url.pathname.startsWith("/api/")) {
        await route.continue();
        return;
      }
      const stationRequest = url.pathname === "/api/departures" && url.search === "?station=940GZZLUCTN";
      const journeyRequest = url.pathname === "/api/journey" && url.search === "?from=940GZZLUCTN&to=940GZZLUEGW";
      if (!stationRequest && !journeyRequest) {
        unexpected.push(`${url.pathname}${url.search}`);
        await route.fulfill({ status: 400, json: { error: "UNEXPECTED_TEST_REQUEST" } });
        return;
      }
      if (api.mode === "unavailable") {
        await route.fulfill({ status: 503, json: { error: "TFL_UNAVAILABLE" } });
        return;
      }
      const json = stationRequest
        ? { ...departures, platforms: api.mode === "empty" ? [] : departures.platforms }
        : api.mode === "empty"
          ? { ...journey, trains: [], nextTrainId: null, fastestTrainId: null, qualification: null, rankings: null }
          : journey;
      await route.fulfill({ json, headers: { "Cache-Control": "no-store" } });
    });
    await use(api);
    expect(unexpected, "Unexpected API or external requests must never escape fixtures").toEqual([]);
  }, { auto: true }],
});

export { expect } from "@playwright/test";
