/** Exercises browser request deadlines and cleanup through the shared live hook. */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveRequest } from "./useLiveRequest";

const url = () => "/api/departures?station=a";
const parse = (value: unknown) => value as { version: number };
const options = { key: "a", active: true, url, parse };
const response = (version: number) => new Response(JSON.stringify({ version }), { status: 200 });
const delay = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

describe("live request deadlines", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  // Break: the browser deadline expires during the journey route's second legal server phase.
  it("accepts a valid response after delayed route lookup and failed optional destination work", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => {
      await delay(7_999); // Route lookup may consume almost one server deadline.
      await Promise.allSettled([
        delay(7_999).then(() => { throw new Error("destination unavailable"); }),
        delay(7_999).then(() => { throw new Error("timetable unavailable"); }),
      ]);
      return response(1);
    });
    const { result } = renderHook(() => useLiveRequest(options));

    await act(async () => { void result.current.fetchLive(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_997); });
    expect(result.current.loading).toBe(true);
    expect(result.current.issue).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });

    expect(result.current.loading).toBe(false);
    expect(result.current.issue).toBeNull();
    expect(result.current.data).toEqual({ version: 1 });
  });

  // Break: a timed-out refresh leaves loading/in-flight set or loses keyed stale data.
  it("ends a hung refresh at twenty seconds, retains stale data, and accepts a retry", async () => {
    let resolveLate!: (value: Response) => void;
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(1))
      .mockReturnValueOnce(new Promise((resolve) => { resolveLate = resolve; }))
      .mockResolvedValueOnce(response(2));
    const { result } = renderHook(() => useLiveRequest(options));
    await act(async () => { await result.current.fetchLive(); });
    await act(async () => { void result.current.fetchLive(true); void result.current.fetchLive(); });
    expect(fetch).toHaveBeenCalledTimes(2);
    const signal = vi.mocked(fetch).mock.calls[1]![1]!.signal!;
    await act(async () => { await vi.advanceTimersByTimeAsync(19_999); });
    expect(result.current.loading).toBe(true);
    expect(result.current.issue).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.loading).toBe(false);
    expect(result.current.issue).toBe("upstream");
    expect(result.current.data).toEqual({ version: 1 });
    expect(signal.aborted).toBe(true);
    await act(async () => { await result.current.fetchLive(true); });
    expect(result.current.data).toEqual({ version: 2 });
    expect(result.current.issue).toBeNull();
    await act(async () => { resolveLate(response(99)); });
    expect(result.current.data).toEqual({ version: 2 });
  });

  // Break: stopping the deadline at headers allows stalled JSON bodies to hang.
  it("times out while the response body is still loading", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => new Promise(() => {}) } as Response);
    const { result } = renderHook(() => useLiveRequest(options));
    await act(async () => { void result.current.fetchLive(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(result.current.loading).toBe(false);
    expect(result.current.issue).toBe("upstream");
    expect(result.current.data).toBeNull();
  });

  // Break: key/view changes or offline transitions leak deadline timers or publish old errors.
  it.each(["key", "inactive", "offline", "unmount"])("cancels pending work cleanly on %s", async (event) => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const { result, rerender, unmount } = renderHook((props) => useLiveRequest(props), { initialProps: options });
    const timersBefore = vi.getTimerCount();
    await act(async () => { void result.current.fetchLive(); });
    const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
    expect(vi.getTimerCount()).toBe(timersBefore + 1);
    await act(async () => {
      if (event === "key") rerender({ ...options, key: "b" });
      if (event === "inactive") rerender({ ...options, active: false });
      if (event === "offline") window.dispatchEvent(new Event("offline"));
      if (event === "unmount") unmount();
    });
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(event === "inactive" || event === "unmount" ? 0 : timersBefore);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    if (event !== "unmount") expect(result.current.issue).toBe(event === "offline" ? "offline" : null);
  });

  // Break: completed requests retain timeout resources, later aborting healthy responses.
  it.each([200, 503, 400])("clears deadline resources after HTTP %s", async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ version: 1 }), { status }));
    const { result, unmount } = renderHook(() => useLiveRequest(options));
    const timersBefore = vi.getTimerCount();
    await act(async () => { await result.current.fetchLive(); });
    const signal = vi.mocked(fetch).mock.calls[0]![1]!.signal!;
    expect(vi.getTimerCount()).toBe(timersBefore);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(signal.aborted).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.issue).toBe(status === 200 ? null : status === 503 ? "upstream" : "invalid");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  // Break: a timeout settling after an offline event overwrites the offline issue.
  it("keeps offline state when the connection disappears as a timeout fires", async () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLiveRequest(options));
    await act(async () => { void result.current.fetchLive(); });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.issue).toBe("offline");
    expect(result.current.loading).toBe(false);
  });
});
