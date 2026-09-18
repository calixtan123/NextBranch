import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getArrivals, getRoutes, getTimetable, TflError } from "./client";

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
    vi.useRealTimers();
    if (originalKey === undefined) delete process.env.TFL_API_KEY;
    else process.env.TFL_API_KEY = originalKey;
  });

  it("uses no-store arrivals and cached topology and timetable requests", async () => {
    process.env.TFL_API_KEY = "test-key";
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => arrival });
    vi.stubGlobal("fetch", fetcher);

    await getArrivals("940GZZLUCTN");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });

    fetcher.mockResolvedValue({ ok: true, json: async () => topology });
    await getRoutes();
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ next: { revalidate: 43_200 } });

    fetcher.mockResolvedValue({ ok: true, json: async () => timetable });
    await getTimetable("940GZZLUCTN", "940GZZLUEGW");
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ next: { revalidate: 43_200 } });
  });

  // Break: a hung fetch never aborts, leaving every endpoint waiting indefinitely.
  it.each([
    ["arrivals", () => getArrivals("940GZZLUCTN")],
    ["routes", () => getRoutes()],
    ["timetable", () => getTimetable("940GZZLUCTN", "940GZZLUEGW")],
  ])("ends hung %s requests after eight seconds as upstream failures", async (_name, request) => {
    vi.useFakeTimers();
    process.env.TFL_API_KEY = "test-key";
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options) => {
      signal = options?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal?.reason), { once: true });
      });
    }));
    const outcome = request().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(signal?.aborted).not.toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(await outcome).toMatchObject({ name: "TflError", code: "upstream" });
    expect(vi.getTimerCount()).toBe(0);
  });

  // Break: abort errors are incorrectly presented as malformed topology/timetables.
  it.each(["AbortError", "TimeoutError"])("normalizes a native %s without exposing request details", async (name) => {
    process.env.TFL_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("secret request URL", name)));
    await expect(getRoutes()).rejects.toMatchObject({ code: "upstream" });
    await expect(getTimetable("a", "b")).rejects.toMatchObject({ code: "upstream" });
    await expect(getArrivals("a")).rejects.not.toHaveProperty("message", expect.stringContaining("secret"));
  });

  // Break: caller cancellation is dropped when a request adds its own deadline.
  it.each([false, true])("honors caller cancellation (already aborted=%s) and clears its deadline", async (alreadyAborted) => {
    vi.useFakeTimers();
    process.env.TFL_API_KEY = "test-key";
    const caller = new AbortController();
    if (alreadyAborted) caller.abort();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options) => {
      signal = options?.signal;
      return new Promise((_resolve, reject) => {
        if (signal?.aborted) reject(signal.reason);
        else signal?.addEventListener("abort", () => reject(signal?.reason), { once: true });
      });
    }));
    const outcome = getRoutes(caller.signal).catch((error: unknown) => error);
    caller.abort();
    expect(signal?.aborted ?? alreadyAborted).toBe(true);
    expect(await outcome).toMatchObject({ code: "upstream" });
    expect(vi.getTimerCount()).toBe(0);
  });

  // Break: the deadline ends at headers and a stalled response body hangs forever.
  it("keeps the deadline until the response body has finished", async () => {
    vi.useFakeTimers();
    process.env.TFL_API_KEY = "test-key";
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      signal = options?.signal;
      return { ok: true, json: () => new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal?.reason), { once: true });
      }) };
    }));
    const outcome = getArrivals("a").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(signal?.aborted).toBe(true);
    expect(await outcome).toMatchObject({ code: "upstream" });
    expect(vi.getTimerCount()).toBe(0);
  });

  // Break: completing requests retain their deadline and later abort a finished signal.
  it.each([true, false])("clears the deadline after a response with ok=%s", async (ok) => {
    vi.useFakeTimers();
    process.env.TFL_API_KEY = "test-key";
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      signal = options?.signal;
      return { ok, status: ok ? 200 : 503, json: async () => arrival };
    }));
    await getArrivals("940GZZLUCTN").catch(() => undefined);
    expect(signal).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(signal?.aborted).toBe(false);
  });

  // Break: ignoring transport abort leaves calls pending, permits late success,
  // or leaks a caller-cancelled request's timer until its original deadline.
  it.each([
    ["fetch", "timeout", "resolve"],
    ["body", "timeout", "resolve"],
    ["fetch", "caller", "resolve"],
    ["body", "caller", "resolve"],
    ["fetch", "timeout", "reject"],
    ["body", "timeout", "reject"],
    ["fetch", "caller", "reject"],
    ["body", "caller", "reject"],
  ])("settles %s ignoring abort on %s cancellation before late %s", async (phase, cancellation, lateOutcome) => {
    vi.useFakeTimers();
    process.env.TFL_API_KEY = "test-key";
    const caller = new AbortController();
    let resolveLate!: (value: unknown) => void;
    let rejectLate!: (reason: unknown) => void;
    const pending = new Promise((resolve, reject) => { resolveLate = resolve; rejectLate = reject; });
    const response = { ok: true, status: 200, json: async () => topology };
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options) => {
      signal = options.signal;
      return phase === "fetch" ? pending : Promise.resolve({ ...response, json: () => pending });
    }));
    let settled: unknown;
    const request = getRoutes(caller.signal).then(
      (value) => { settled = value; },
      (error: unknown) => { settled = error; },
    );
    await vi.advanceTimersByTimeAsync(cancellation === "timeout" ? 7_999 : 100);
    expect(settled).toBeUndefined();
    expect(signal?.aborted).toBe(false);
    if (cancellation === "caller") caller.abort();
    await vi.advanceTimersByTimeAsync(cancellation === "timeout" ? 1 : 0);
    expect(settled).toBeInstanceOf(TflError);
    expect(settled).toMatchObject({ code: "upstream" });
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await request;
    const failure = settled;
    if (lateOutcome === "resolve") resolveLate(phase === "fetch" ? response : topology);
    else rejectLate(new Error("late transport failure"));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(settled).toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
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

  it("normalizes an all-malformed non-empty arrivals payload as an upstream error", async () => {
    process.env.TFL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "bad" }] }),
    );

    await expect(getArrivals("940GZZLUCTN")).rejects.toMatchObject({
      code: "upstream",
      name: TflError.name,
    });
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
