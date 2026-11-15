import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeparturesRequest } from "./useDeparturesRequest";

const response = (station = "a") => ({ station: { id: station, name: "A" }, observedAt: "2026-09-16T12:00:00.000Z", newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [] });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("useDeparturesRequest", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("coalesces matching requests, aborts superseded stations, and retains same-station data on failure", async () => {
    const old = deferred<Response>(); const fresh = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise).mockResolvedValueOnce(new Response("down", { status: 503 }));
    const { result, rerender } = renderHook(({ station }) => useDeparturesRequest(station), { initialProps: { station: "a" as string | null } });
    await act(async () => { void result.current.fetchDepartures(); void result.current.fetchDepartures(); });
    expect(fetch).toHaveBeenCalledTimes(1);
    const oldSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal as AbortSignal;
    rerender({ station: "b" });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { void result.current.fetchDepartures(); fresh.resolve(new Response(JSON.stringify(response("b")), { status: 200 })); });
    await waitFor(() => expect(result.current.data?.station.id).toBe("b"));
    await act(async () => { await result.current.fetchDepartures(); });
    expect(result.current.data?.station.id).toBe("b");
    expect(result.current.issue).toBe("upstream");
  });

  it("polls only when active, visible, and online and enforces the manual cooldown", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(response()), { status: 200 }));
    const { result, rerender } = renderHook(({ station, active }) => useDeparturesRequest(station, active), { initialProps: { station: "a" as string | null, active: true } });
    await act(async () => { await result.current.fetchDepartures(); vi.advanceTimersByTime(30_000); });
    expect(fetch).toHaveBeenCalledTimes(2);
    rerender({ station: "a", active: false });
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(fetch).toHaveBeenCalledTimes(2);
    rerender({ station: "a", active: true });
    await act(async () => { void result.current.fetchDepartures(true); });
    expect(fetch).toHaveBeenCalledTimes(3);
    await act(async () => { void result.current.fetchDepartures(true); });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("starts the manual cooldown when a manual refresh coalesces with an automatic request", async () => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useDeparturesRequest("a"));
    await act(async () => { void result.current.fetchDepartures(); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { void result.current.fetchDepartures(true); });
    await act(async () => { pending.resolve(new Response(JSON.stringify(response()), { status: 200 })); await Promise.resolve(); });
    expect(result.current.data?.station.id).toBe("a");
    await act(async () => { void result.current.fetchDepartures(true); });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it("anchors web departures through slow body parsing without losing cached source age or accepting clock jumps", async () => {
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  let elapsed = 200;
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const payload = { ...response(), generatedAt: response().observedAt,
    observedAt: "2026-09-16T11:59:35.000Z" };
  vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200,
    json: async () => { elapsed += 8_000; return payload; } } as Response);
  const { result, unmount } = renderHook(() => useDeparturesRequest("a"));
  try {
    await act(async () => { await result.current.fetchDepartures(); });
    expect(result.current.data?.timing).toMatchObject({ uncertaintyMs: 8_000, approximate: false });
    const { responseAge, responseTime } = await import("@/lib/northern/response-time");
    const data = result.current.data!;
    expect(responseAge(data, elapsed)).toBe(33_000);
    vi.spyOn(Date, "now").mockReturnValue(0);
    expect(responseTime(data, elapsed + 2_000)).toBe(Date.parse(payload.generatedAt) + 10_000);
  } finally { unmount(); vi.restoreAllMocks(); }
});

it("cancels a departure read across browser suspension and retains uncertain data until recovery", async () => {
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  const pending = deferred<Response>();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(response()), { status: 200 }))
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(new Response("down", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(response()), { status: 200 }));
  const { result, unmount } = renderHook(() => useDeparturesRequest("a"));
  try {
    await act(async () => { await result.current.fetchDepartures(); });
    await act(async () => { void result.current.fetchDepartures(); });
    const signal = vi.mocked(fetch).mock.calls[1][1]?.signal;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(signal?.aborted).toBe(true);
    expect(result.current.data?.timing?.suspended).toBe(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current.issue).toBe("upstream");
    expect(result.current.data?.timing?.suspended).toBe(true);
    await act(async () => { await result.current.fetchDepartures(); });
    expect(result.current.data?.timing?.suspended).toBeUndefined();
    expect(result.current.issue).toBeNull();
  } finally {
    unmount(); vi.restoreAllMocks();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  }
});
