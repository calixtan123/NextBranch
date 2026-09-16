import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getArrivals, getRoutes, getTimetable } from "./client";

const originalKey = process.env.TFL_API_KEY;
const arrival = [{
  id: "1",
  naptanId: "940GZZLUCTN",
  lineId: "northern",
  expectedArrival: "2026-09-14T12:00:00.000Z",
}];
const topology = {
  lineId: "northern",
  orderedLineRoutes: [],
  stopPointSequences: [],
};
const timetable = {
  lineId: "northern",
  timetable: { departureStopId: "940GZZLUCTN", routes: [] },
};

describe("TfL arrivals boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.TFL_API_KEY;
    else process.env.TFL_API_KEY = originalKey;
  });

  it("uses no-store arrivals and cached topology and timetable requests", async () => {
    process.env.TFL_API_KEY = "test-key";
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => arrival });
    vi.stubGlobal("fetch", fetcher);

    await getArrivals("940GZZLUCTN");
    expect(fetcher.mock.calls[0]?.[1]).toEqual({ cache: "no-store" });

    fetcher.mockResolvedValue({ ok: true, json: async () => topology });
    await getRoutes();
    expect(fetcher.mock.calls[1]?.[1]).toEqual({ next: { revalidate: 43_200 } });

    fetcher.mockResolvedValue({ ok: true, json: async () => timetable });
    await getTimetable("940GZZLUCTN", "940GZZLUEGW");
    expect(fetcher.mock.calls[2]?.[1]).toEqual({ next: { revalidate: 43_200 } });
  });

  it("keeps only records for the requested station", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "right",
            naptanId: "station-a",
            lineId: "northern",
            expectedArrival: "2026-09-16T12:00:00.000Z",
          },
          {
            id: "wrong",
            naptanId: "station-b",
            lineId: "northern",
            expectedArrival: "2026-09-16T12:01:00.000Z",
          },
        ],
      }),
    );
    process.env.TFL_API_KEY = "test";

    await expect(getArrivals("station-a")).resolves.toMatchObject([
      { id: "right", naptanId: "station-a" },
    ]);
  });

  it("rejects a timetable whose departure stop differs from the request", async () => {
    process.env.TFL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...timetable,
          timetable: { departureStopId: "940GZZLUBNK", routes: [] },
        }),
      }),
    );

    await expect(
      getTimetable("940GZZLUCTN", "940GZZLUEGW"),
    ).rejects.toMatchObject({ code: "timetable" });
  });
});
