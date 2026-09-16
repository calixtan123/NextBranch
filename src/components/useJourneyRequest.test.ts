import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJourneyRequest } from "./useJourneyRequest";

const response = (from = "a", to = "b") => ({
  journey: { from, to }, observedAt: "2026-09-16T12:00:00.000Z", predictionGeneratedAt: null,
  trains: [], additionalSuitableCount: 0, withheldAmbiguousCount: 0,
  nextTrainId: null, fastestTrainId: null, qualification: null, rankings: null, minutesSaved: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useJourneyRequest", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("coalesces concurrent refresh triggers for one journey", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useJourneyRequest({ from: "a", to: "b" }));
    await act(async () => { void result.current.fetchJourney(); void result.current.fetchJourney(); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(new Response(JSON.stringify(response()), { status: 200 })));
    await waitFor(() => expect(result.current.data?.journey.from).toBe("a"));
  });

  it("aborts the superseded route and never exposes its late response", async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const { result, rerender } = renderHook(({ from, to }) => useJourneyRequest({ from, to }), { initialProps: { from: "a", to: "b" } });
    await act(async () => { void result.current.fetchJourney(); });
    const oldSignal = vi.mocked(fetch).mock.calls[0]![1]!.signal as AbortSignal;
    rerender({ from: "c", to: "d" });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { void result.current.fetchJourney(); });
    await act(async () => newRequest.resolve(new Response(JSON.stringify(response("c", "d")), { status: 200 })));
    await waitFor(() => expect(result.current.data?.journey).toEqual({ from: "c", to: "d" }));
    await act(async () => oldRequest.resolve(new Response(JSON.stringify(response("a", "b")), { status: 200 })));
    expect(result.current.data?.journey).toEqual({ from: "c", to: "d" });
  });

  it("polls only while visible and online, and resumes once after offline", async () => {
    vi.useFakeTimers();
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useJourneyRequest({ from: "a", to: "b" }));
    await act(async () => { void result.current.fetchJourney(); first.resolve(new Response(JSON.stringify(response()), { status: 200 })); });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(result.current.issue).toBe("offline");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { second.resolve(new Response(JSON.stringify(response()), { status: 200 })); });
    expect(result.current.issue).toBeNull();
  });

  it("enforces the ten-second manual cooldown", async () => {
    vi.useFakeTimers();
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useJourneyRequest({ from: "a", to: "b" }));
    await act(async () => { void result.current.fetchJourney(true); });
    await act(async () => first.resolve(new Response(JSON.stringify(response()), { status: 200 })));
    await act(async () => { void result.current.fetchJourney(true); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(10_000); void result.current.fetchJourney(true); });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => second.resolve(new Response(JSON.stringify(response()), { status: 200 })));
  });

  it("classifies invalid JSON and 503 responses, retaining same-route data on failure", async () => {
    const initial = new Response(JSON.stringify(response()), { status: 200 });
    const failure = new Response("down", { status: 503 });
    vi.mocked(fetch).mockReturnValueOnce(Promise.resolve(initial)).mockReturnValueOnce(Promise.resolve(failure));
    const { result } = renderHook(() => useJourneyRequest({ from: "a", to: "b" }));
    await act(async () => { await result.current.fetchJourney(); });
    expect(result.current.data?.journey).toEqual({ from: "a", to: "b" });
    await act(async () => { await result.current.fetchJourney(); });
    expect(result.current.issue).toBe("upstream");
    expect(result.current.data?.journey).toEqual({ from: "a", to: "b" });

    vi.mocked(fetch).mockReturnValueOnce(Promise.resolve(new Response(JSON.stringify({ nope: true }), { status: 200 })));
    await act(async () => { await result.current.fetchJourney(); });
    expect(result.current.issue).toBe("invalid");
  });

  it("rejects a structurally valid response for a different requested journey", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(response("other", "route")), { status: 200 }),
    );
    const { result } = renderHook(() => useJourneyRequest({ from: "a", to: "b" }));
    await act(async () => { await result.current.fetchJourney(); });
    expect(result.current.data).toBeNull();
    expect(result.current.issue).toBe("invalid");
  });

  it("treats every 5xx response as upstream failure", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("down", { status: 502 }));
    const { result } = renderHook(() => useJourneyRequest({ from: "a", to: "b" }));
    await act(async () => { await result.current.fetchJourney(); });
    expect(result.current.issue).toBe("upstream");
  });

  it("treats malformed JSON and 4xx responses as invalid", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
      .mockResolvedValueOnce(new Response("bad request", { status: 400 }));
    const { result } = renderHook(() => useJourneyRequest({ from: "a", to: "b" }));
    await act(async () => { await result.current.fetchJourney(); });
    expect(result.current.issue).toBe("invalid");
    await act(async () => { await result.current.fetchJourney(); });
    expect(result.current.issue).toBe("invalid");
  });

  it("aborts and cleans up the request on unmount", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useJourneyRequest({ from: "a", to: "b" }));
    await act(async () => { void result.current.fetchJourney(); });
    const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    window.dispatchEvent(new Event("online"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
