import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let client: typeof import("./client");
beforeEach(async () => {
  vi.resetModules();
  client = await import("./client");
});

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

    await client.getArrivals("940GZZLUCTN");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });

    fetcher.mockResolvedValue({ ok: true, json: async () => topology });
    await client.getRoutes();
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ next: { revalidate: 43_200 } });

    fetcher.mockResolvedValue({ ok: true, json: async () => timetable });
    await client.getTimetable("940GZZLUCTN", "940GZZLUEGW");
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ next: { revalidate: 43_200 } });
  });

  it("records one redacted fetch-attempt marker before an arrivals fetch", async () => {
    const secretKey = "secret-key";
    const stationId = "940GZZLUCTN";
    process.env.TFL_API_KEY = secretKey;
    const diagnostic = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => arrival }));

    try {
      await client.getArrivals(stationId);

      const attempts = diagnostic.mock.calls.filter(([event]) => event === "tfl_fetch_attempt");
      expect(attempts).toEqual([["tfl_fetch_attempt", { operation: "arrivals" }]]);
      expect(JSON.stringify(attempts)).not.toContain(secretKey);
      expect(JSON.stringify(attempts)).not.toContain(stationId);
      expect(JSON.stringify(attempts)).not.toContain("api.tfl.gov.uk");
      expect(JSON.stringify(attempts)).not.toContain("/Line/");
    } finally {
      diagnostic.mockRestore();
    }
  });

  it("coalesces parallel misses and reuses a completed feed inside the TTL", async () => {
    process.env.TFL_API_KEY = "test-key";
    let resolve!: (value: { ok: boolean; json: () => Promise<typeof arrival> }) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
      .mockResolvedValue({ ok: true, json: async () => arrival });
    vi.stubGlobal("fetch", fetcher);

    const first = client.getArrivals("940GZZLUCTN");
    const second = client.getArrivals("940GZZLUCTN");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    resolve({ ok: true, json: async () => arrival });
    await expect(Promise.all([first, second])).resolves.toEqual([arrival, arrival]);

    await expect(client.getArrivals("940GZZLUCTN")).resolves.toEqual(arrival);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not record another fetch attempt for a coalesced request or arrivals cache hit", async () => {
    process.env.TFL_API_KEY = "test-key";
    let resolve!: (value: { ok: boolean; json: () => Promise<typeof arrival> }) => void;
    const diagnostic = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise((done) => { resolve = done; })));

    try {
      const first = client.getArrivals("940GZZLUCTN");
      const second = client.getArrivals("940GZZLUCTN");
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      resolve({ ok: true, json: async () => arrival });
      await Promise.all([first, second]);
      await client.getArrivals("940GZZLUCTN");

      expect(diagnostic.mock.calls.filter(([event]) => event === "tfl_fetch_attempt"))
        .toEqual([["tfl_fetch_attempt", { operation: "arrivals" }]]);
    } finally {
      diagnostic.mockRestore();
    }
  });

  it("records an attempt when TfL returns an upstream failure", async () => {
    process.env.TFL_API_KEY = "test-key";
    const diagnostic = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => [] }));

    try {
      await expect(client.getArrivals("940GZZLUCTN")).rejects.toMatchObject({ code: "upstream" });

      expect(diagnostic.mock.calls.filter(([event]) => event === "tfl_fetch_attempt"))
        .toEqual([["tfl_fetch_attempt", { operation: "arrivals" }]]);
    } finally {
      diagnostic.mockRestore();
    }
  });

  it("does not record a fetch attempt when TfL configuration is missing", async () => {
    delete process.env.TFL_API_KEY;
    const diagnostic = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn());

    try {
      await expect(client.getArrivals("940GZZLUCTN")).rejects.toMatchObject({ code: "config" });

      expect(diagnostic.mock.calls.filter(([event]) => event === "tfl_fetch_attempt")).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      diagnostic.mockRestore();
    }
  });

  it("does not record a fetch attempt when the caller has already cancelled", async () => {
    process.env.TFL_API_KEY = "test-key";
    const caller = new AbortController();
    caller.abort();
    const diagnostic = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn());

    try {
      await expect(client.getRoutes(caller.signal)).rejects.toMatchObject({ code: "upstream" });

      expect(diagnostic.mock.calls.filter(([event]) => event === "tfl_fetch_attempt")).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      diagnostic.mockRestore();
    }
  });

  // Break: a rejected coalesced request remains in the overlap registry and makes
  // every later live refresh fail without contacting TfL again.
  it("removes a failed arrivals request from the overlap registry", async () => {
    process.env.TFL_API_KEY = "test-key";
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => arrival });
    vi.stubGlobal("fetch", fetcher);

    const first = client.getArrivals("940GZZLUCTN");
    const second = client.getArrivals("940GZZLUCTN");
    await expect(Promise.all([first, second])).rejects.toMatchObject({ code: "upstream" });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await expect(client.getArrivals("940GZZLUCTN")).resolves.toEqual(arrival);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  // Break: a hung fetch never aborts, leaving every endpoint waiting indefinitely.
  it.each([
    ["arrivals", () => client.getArrivals("940GZZLUCTN")],
    ["routes", () => client.getRoutes()],
    ["timetable", () => client.getTimetable("940GZZLUCTN", "940GZZLUEGW")],
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
    await expect(client.getRoutes()).rejects.toMatchObject({ code: "upstream" });
    await expect(client.getTimetable("a", "b")).rejects.toMatchObject({ code: "upstream" });
    await expect(client.getArrivals("a")).rejects.not.toHaveProperty("message", expect.stringContaining("secret"));
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
    const outcome = client.getRoutes(caller.signal).catch((error: unknown) => error);
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
    const outcome = client.getArrivals("a").catch((error: unknown) => error);
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
    await client.getArrivals("940GZZLUCTN").catch(() => undefined);
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
    const request = client.getRoutes(caller.signal).then(
      (value) => { settled = value; },
      (error: unknown) => { settled = error; },
    );
    await vi.advanceTimersByTimeAsync(cancellation === "timeout" ? 7_999 : 100);
    expect(settled).toBeUndefined();
    expect(signal?.aborted).toBe(false);
    if (cancellation === "caller") caller.abort();
    await vi.advanceTimersByTimeAsync(cancellation === "timeout" ? 1 : 0);
    expect(settled).toBeInstanceOf(client.TflError);
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

    await expect(client.getArrivals("station-a")).resolves.toMatchObject([
      { id: "right", naptanId: "station-a" },
    ]);
  });

  it("normalizes an all-malformed non-empty arrivals payload as an upstream error", async () => {
    process.env.TFL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "bad" }] }),
    );

    await expect(client.getArrivals("940GZZLUCTN")).rejects.toMatchObject({
      code: "upstream",
      name: client.TflError.name,
    });
  });

  // Break: a malformed successful HTTP response is reported as a successful
  // transport operation, leaving production diagnostics unable to find the cause.
  it("records malformed arrivals payloads as normalized upstream failures", async () => {
    process.env.TFL_API_KEY = "test-key";
    const diagnostic = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "bad" }] }));

    await expect(client.getArrivals("940GZZLUCTN")).rejects.toMatchObject({ code: "upstream" });

    expect(diagnostic).toHaveBeenCalledWith("tfl_diagnostic", expect.objectContaining({
      operation: "arrivals", errorCategory: "upstream", upstreamStatus: null,
    }));
    diagnostic.mockRestore();
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
      client.getTimetable("940GZZLUCTN", "940GZZLUEGW"),
    ).rejects.toMatchObject({ code: "timetable" });
  });
});

it("isolates concurrent exact line/stop feeds and filters both identities at the boundary", async () => {
  const { getLineArrivals } = await import("./client");
  process.env.TFL_API_KEY = "test-key";
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => [
    { ...arrival[0], lineId: url.includes('/Line/central/') ? "central" : "district" },
    { ...arrival[0], lineId: "victoria" },
    { ...arrival[0], lineId: "central", naptanId: "other" },
  ] }));
  vi.stubGlobal("fetch", fetcher);
  try {
    const [central, duplicate, district] = await Promise.all([
      getLineArrivals("central", "940GZZLUCTN"), getLineArrivals("central", "940GZZLUCTN"), getLineArrivals("district", "940GZZLUCTN"),
    ]);
    expect(central.map(a => a.lineId)).toEqual(["central"]);
    expect(duplicate).toEqual(central);
    expect(district.map(a => a.lineId)).toEqual(["district"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
      expect.stringContaining("/Line/central/Arrivals/940GZZLUCTN"), expect.stringContaining("/Line/district/Arrivals/940GZZLUCTN"),
    ]));
  } finally {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.TFL_API_KEY;
    else process.env.TFL_API_KEY = originalKey;
  }
});

describe("bounded successful feed cache", () => {
  beforeEach(() => {
    process.env.TFL_API_KEY = "test-key";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    if (originalKey === undefined) delete process.env.TFL_API_KEY;
    else process.env.TFL_API_KEY = originalKey;
  });

  it("retains original source time until the exact ten-second expiry boundary", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => arrival });
    vi.stubGlobal("fetch", fetcher);
    const first = await client.getLineArrivalsFeed("northern", "940GZZLUCTN");
    expect(first.fetchedAt).toBe("2026-11-15T12:00:00.000Z");
    await vi.advanceTimersByTimeAsync(9_999);
    expect(await client.getLineArrivalsFeed("northern", "940GZZLUCTN")).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const refreshed = await client.getLineArrivalsFeed("northern", "940GZZLUCTN");
    expect(refreshed.fetchedAt).toBe("2026-11-15T12:00:10.000Z");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("evicts the earliest inserted success after 256 exact keys, even when read again", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetcher);
    for (let i = 0; i < 256; i++) await client.getLineArrivals("northern", String(i));
    await client.getLineArrivals("northern", "0");
    await client.getLineArrivals("northern", "256");
    await client.getLineArrivals("northern", "1");
    expect(fetcher).toHaveBeenCalledTimes(257);
    await client.getLineArrivals("northern", "0");
    expect(fetcher).toHaveBeenCalledTimes(258);
  });

  it("caches valid empty feeds and isolates both tuple components including separator-like input", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetcher);
    for (const [line, stop] of [["a:b", "c"], ["a", "b:c"], ["a:b", "other"]] as const) {
      expect(await client.getLineArrivals(line, stop)).toEqual([]);
      expect(await client.getLineArrivals(line, stop)).toEqual([]);
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("retries failed payload validation without caching the failure", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "bad" }] })
      .mockResolvedValue({ ok: true, json: async () => arrival });
    vi.stubGlobal("fetch", fetcher);
    await expect(client.getLineArrivalsFeed("northern", "940GZZLUCTN")).rejects.toMatchObject({ code: "upstream" });
    expect((await client.getLineArrivalsFeed("northern", "940GZZLUCTN")).arrivals).toEqual(arrival);
    await client.getLineArrivals("northern", "940GZZLUCTN");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns isolated copies to parallel, cached, and arrivals-only consumers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => arrival }));
    const [first, second] = await Promise.all([
      client.getLineArrivalsFeed("northern", "940GZZLUCTN"),
      client.getLineArrivalsFeed("northern", "940GZZLUCTN"),
    ]);
    first.arrivals[0]!.id = "poisoned";
    first.arrivals.length = 0;
    first.fetchedAt = "changed";
    expect(second.arrivals).toEqual(arrival);
    const legacy = await client.getArrivals("940GZZLUCTN");
    legacy[0]!.id = "also poisoned";
    expect((await client.getLineArrivalsFeed("northern", "940GZZLUCTN")).arrivals).toEqual(arrival);
  });

  it("rejects an already cancelled caller on a cache hit without fetching", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => arrival });
    vi.stubGlobal("fetch", fetcher);
    await client.getArrivals("940GZZLUCTN");
    const caller = new AbortController();
    caller.abort();
    await expect(client.getArrivals("940GZZLUCTN", caller.signal)).rejects.toMatchObject({ code: "upstream" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("isolates caller cancellation from a shared miss and never caches late cancelled work", async () => {
    let resolveShared!: (value: unknown) => void;
    let resolveCancelled!: (value: unknown) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveShared = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveCancelled = resolve; }))
      .mockResolvedValue({ ok: true, json: async () => arrival });
    vi.stubGlobal("fetch", fetcher);
    const shared = client.getArrivals("940GZZLUCTN");
    const caller = new AbortController();
    const isolated = client.getArrivals("940GZZLUCTN", caller.signal).catch(error => error);
    caller.abort();
    expect(await isolated).toMatchObject({ code: "upstream" });
    resolveShared({ ok: true, json: async () => arrival });
    expect(await shared).toEqual(arrival);
    resolveCancelled({ ok: true, json: async () => [{ ...arrival[0], id: "cancelled" }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(await client.getArrivals("940GZZLUCTN")).toEqual(arrival);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
