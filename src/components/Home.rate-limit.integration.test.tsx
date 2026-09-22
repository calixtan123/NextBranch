/** Exercises the real departures request lifecycle through the rendered Home view. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const searchParams = vi.hoisted(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn() }),
}));

const station = "940GZZLUCTN";
const departures = {
  station: { id: station, name: "Camden Town" },
  observedAt: "2026-09-16T12:00:00.000Z",
  newestPredictionGeneratedAt: null,
  refreshAfterSeconds: 30,
  platforms: [{
    platform: "1",
    direction: "Northbound",
    departures: [{
      id: "one",
      destinationName: "Edgware",
      expectedArrival: "2026-09-16T12:02:00.000Z",
      secondsToStation: 120,
      towards: null,
    }],
  }],
};

describe("Home rate-limit integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn());
    searchParams.set("station", station);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    searchParams.delete("station");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  // Break: a real API 429 after a successful board does not reach Home's alert,
  // stale-data label, and disabled Retry presentation through the actual hook.
  it("renders a real 429 over stale departures and enables Retry after the server window", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(departures), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "RATE_LIMITED", retryAfterSeconds: 30 }), {
        status: 429,
        headers: { "Retry-After": "30" },
      }));

    render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("Edgware")).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole("alert")).toHaveTextContent("Too many live requests. Try again in 30 seconds.");
    expect(screen.getAllByText("Last prediction — information may be stale.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();

    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    fireEvent(document, new Event("visibilitychange"));

    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });
});
