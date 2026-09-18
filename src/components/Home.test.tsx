import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const fetchJourney = vi.hoisted(() => vi.fn());
const requestedJourneys = vi.hoisted(() => [] as Array<{ from: string; to: string } | null>);
const requestState = vi.hoisted(() => ({ data: null as Record<string, unknown> | null, dataKey: null as string | null, loading: false, issue: null as string | null, cooldownUntil: 0 }));
const fetchDepartures = vi.hoisted(() => vi.fn());
const requestedDepartures = vi.hoisted(() => [] as Array<{ station: string | null; active: boolean }>);
const departureState = vi.hoisted(() => ({ data: null as Record<string, unknown> | null, loading: false, issue: null as string | null, cooldownUntil: 0 }));
const searchParams = vi.hoisted(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("./useJourneyRequest", () => ({
  useJourneyRequest: (journey: { from: string; to: string } | null) => { requestedJourneys.push(journey); return { ...requestState, data: journey && requestState.dataKey === `${journey.from}:${journey.to}` ? requestState.data : null, fetchJourney }; },
}));
vi.mock("./useDeparturesRequest", () => ({
  useDeparturesRequest: (station: string | null, active: boolean) => { requestedDepartures.push({ station, active }); return { ...departureState, fetchDepartures }; },
}));

const saved = { from: "940GZZLUCTN", to: "940GZZLUEGW", fromName: "Camden Town", toName: "Edgware" };

describe("Home", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const makeStorage = () => { let value: string | null = null; return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; }, removeItem: () => { value = null; } }; };
    Object.defineProperty(window, "localStorage", { configurable: true, value: makeStorage() });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: makeStorage() });
    fetchJourney.mockReset();
    requestedJourneys.length = 0;
    fetchDepartures.mockReset();
    requestedDepartures.length = 0;
    departureState.data = null;
    departureState.loading = false;
    departureState.issue = null;
    departureState.cooldownUntil = 0;
    requestState.data = null;
    requestState.dataKey = null;
    requestState.loading = false;
    requestState.issue = null;
    requestState.cooldownUntil = 0;
    searchParams.delete("from");
    searchParams.delete("to");
    searchParams.delete("station");
    Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });
  });

  // Break: an unconditional clock wakes once per second on empty and search screens.
  it("does not keep a clock running without live data", async () => {
    vi.useFakeTimers();
    render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    expect(screen.getByRole("heading", { name: "Plan a journey" })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  // Break: hidden tabs keep ticking, resume shows old time, or navigation leaks a clock.
  it.each(["departures", "results"])("pauses the %s clock while hidden and catches up immediately on return", async (view) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
    if (view === "departures") {
      searchParams.set("station", saved.from);
      departureState.data = {
        station: { id: saved.from, name: saved.fromName }, observedAt: "2026-09-16T12:00:00.000Z",
        newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
        platforms: [{ platform: "1", direction: "Northbound", departures: [{ id: "one", destinationName: "Edgware", expectedArrival: "2026-09-16T12:02:00.000Z", secondsToStation: 120, towards: null }] }],
      };
    } else {
      searchParams.set("from", saved.from);
      searchParams.set("to", saved.to);
      requestState.dataKey = `${saved.from}:${saved.to}`;
      requestState.data = {
        journey: { from: saved.from, to: saved.to }, observedAt: "2026-09-16T12:00:00.000Z", predictionGeneratedAt: null,
        trains: [{ id: "next", destinationName: "Edgware", expectedArrival: "2026-09-16T12:02:00.000Z", secondsToOrigin: 120, platform: null, direction: "Northbound", platformConfirmed: false, routeConfidence: "confirmed", via: null, destinationArrival: null, destinationSeconds: null, evidence: "unavailable" }],
        additionalSuitableCount: 0, withheldAmbiguousCount: 0, nextTrainId: "next", fastestTrainId: null, qualification: null, rankings: null, minutesSaved: null,
      };
    }
    const { unmount } = render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("2 min")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByText("2 min")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByText("1 min")).toBeInTheDocument();
    expect(screen.getByText("Updated 60 sec ago")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    expect(vi.getTimerCount()).toBe(0);
    unmount();
    fireEvent(document, new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
  });

  // Break: pausing an empty screen's clock leaves the refresh cooldown absent or stuck.
  it("expires the manual refresh cooldown even before departure data arrives", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
    searchParams.set("station", saved.from);
    const { rerender } = render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    departureState.cooldownUntil = Date.now() + 10_000;
    rerender(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole("button", { name: "Refresh available soon" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
    expect(screen.getByRole("button", { name: "Refresh available soon" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("renders the same first screen before storage hydration and then shows saved-first returning state", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Northern Direct" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Camden Town → Edgware" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  it("keeps Journeys and Change as separate views while a route is active", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    render(<Home />);
    await waitFor(() => screen.getByRole("button", { name: "Camden Town → Edgware" }));
    fireEvent.click(screen.getByRole("button", { name: "Camden Town → Edgware" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Journeys" })).toBeInTheDocument());
    expect(fetchJourney).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Plan a journey" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("heading", { name: "Plan a journey" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Journeys" })).not.toBeInTheDocument();
  });

  it("passes an active journey only to results and resumes after reactivation", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Camden Town → Edgware" })).toBeInTheDocument());
    expect(requestedJourneys.at(-1)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Camden Town → Edgware" }));
    await waitFor(() => expect(requestedJourneys.at(-1)).toEqual({ from: saved.from, to: saved.to, fromName: saved.fromName, toName: saved.toName }));
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    expect(requestedJourneys.at(-1)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Camden Town → Edgware" }));
    await waitFor(() => expect(requestedJourneys.at(-1)?.from).toBe(saved.from));
  });

  it("clears an invalid destination when the origin changes", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    const boxes = screen.getAllByRole("combobox");
    fireEvent.focus(boxes[0]!);
    fireEvent.change(boxes[0]!, { target: { value: "cam" } });
    fireEvent.click(screen.getByRole("option", { name: "Camden Town" }));
    fireEvent.focus(boxes[1]!);
    fireEvent.change(boxes[1]!, { target: { value: "battersea" } });
    fireEvent.click(screen.getByRole("option", { name: "Battersea Power Station" }));
    fireEvent.focus(boxes[0]!);
    fireEvent.change(boxes[0]!, { target: { value: "bank" } });
    fireEvent.click(screen.getByRole("option", { name: "Bank" }));
    expect(boxes[1]).toHaveValue("");
    expect(screen.getByRole("button", { name: "Check trains" })).toBeDisabled();
  });

  it("enables Swap only after both journey stations are selected", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));

    const [from, to] = screen.getAllByRole("combobox");
    const swap = screen.getByRole("button", { name: "Swap" });
    expect(swap).toBeDisabled();

    fireEvent.focus(from!);
    fireEvent.change(from!, { target: { value: "cam" } });
    fireEvent.click(screen.getByRole("option", { name: "Camden Town" }));
    expect(swap).toBeDisabled();

    fireEvent.focus(to!);
    fireEvent.change(to!, { target: { value: "london" } });
    fireEvent.click(screen.getByRole("option", { name: "London Bridge" }));
    expect(swap).not.toBeDisabled();
  });

  it("shows results view after one explicit submit without rendering the saved screen", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    const boxes = screen.getAllByRole("combobox");
    fireEvent.focus(boxes[0]!);
    fireEvent.change(boxes[0]!, { target: { value: "cam" } });
    fireEvent.click(screen.getByRole("option", { name: "Camden Town" }));
    fireEvent.focus(boxes[1]!);
    fireEvent.change(boxes[1]!, { target: { value: "london" } });
    fireEvent.click(screen.getByRole("option", { name: "London Bridge" }));
    expect(screen.getByRole("button", { name: "Check trains" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Check trains" }));
    await waitFor(() => expect(fetchJourney).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("heading", { name: "Plan a journey" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Journeys" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Selected journey" })).toBeInTheDocument();
  });

  it("keeps live announcements separate from the changing results and stable across clock ticks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    requestState.dataKey = `${saved.from}:${saved.to}`;
    requestState.data = {
      journey: { from: saved.from, to: saved.to }, observedAt: "2026-09-16T12:00:00.000Z", predictionGeneratedAt: null,
      trains: [{ id: "next", destinationName: "Edgware", expectedArrival: "2026-09-16T12:01:00.000Z", secondsToOrigin: 60, platform: null, direction: "Northbound", platformConfirmed: false, routeConfidence: "confirmed", via: null, destinationArrival: null, destinationSeconds: null, evidence: "estimate" }],
      additionalSuitableCount: 0, withheldAmbiguousCount: 0, nextTrainId: "next", fastestTrainId: null, qualification: null, rankings: null, minutesSaved: null,
    };
    const { container } = render(<Home />);
    await act(async () => { vi.advanceTimersByTime(0); });
    fireEvent.click(screen.getByRole("button", { name: "Camden Town → Edgware" }));
    await act(async () => { vi.advanceTimersByTime(0); });
    const results = container.querySelector("section:not(.journey-bar)");
    expect(results).not.toHaveAttribute("aria-live");
    const announcement = screen.getByRole("status");
    expect(announcement).toHaveTextContent("1 suitable train");
    const initialAnnouncement = announcement.textContent;
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByRole("status")).toHaveTextContent(initialAnnouncement ?? "");
    expect(screen.getByRole("status")).not.toHaveTextContent(/sec ago|seconds ago/);
  });

  it("announces a refreshed response when observedAt changes", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    requestState.dataKey = `${saved.from}:${saved.to}`;
    requestState.data = {
      journey: { from: saved.from, to: saved.to }, observedAt: "2026-09-16T12:00:00.000Z", predictionGeneratedAt: null,
      trains: [], additionalSuitableCount: 0, withheldAmbiguousCount: 0, nextTrainId: null, fastestTrainId: null, qualification: null, rankings: null, minutesSaved: null,
    };
    const { rerender } = render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Camden Town → Edgware" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Camden Town → Edgware" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("0 suitable trains"));
    const first = screen.getByRole("status");
    requestState.data = { ...requestState.data, observedAt: "2026-09-16T12:01:00.000Z", trains: [{ id: "next", destinationName: "Edgware", expectedArrival: "2026-09-16T12:02:00.000Z", secondsToOrigin: 120, platform: null, direction: "Northbound", platformConfirmed: false, routeConfidence: "confirmed", via: null, destinationArrival: null, destinationSeconds: null, evidence: "estimate" }] };
    rerender(<Home />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 suitable train"));
    expect(screen.getByRole("status")).not.toBe(first);
  });

  it("does not fetch on initial launch and fetches a valid journey URL", async () => {
    const first = render(<Home />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchJourney).not.toHaveBeenCalled();
    first.unmount();
    searchParams.set("from", saved.from);
    searchParams.set("to", saved.to);
    fetchJourney.mockReset();
    render(<Home />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchJourney).toHaveBeenCalledTimes(1);
  });

  it("synchronizes navigation from a station URL to a journey URL and activates only the matching request", async () => {
    searchParams.set("station", saved.from);
    const { rerender } = render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Departures" })).toBeInTheDocument());
    expect(requestedDepartures.at(-1)).toEqual({ station: saved.from, active: true });
    expect(requestedJourneys.at(-1)).toBeNull();

    searchParams.delete("station");
    searchParams.set("from", saved.from);
    searchParams.set("to", saved.to);
    rerender(<Home />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Selected journey" })).toBeInTheDocument());
    expect(requestedJourneys.at(-1)?.from).toBe(saved.from);
    expect(requestedDepartures.at(-1)).toEqual({ station: null, active: false });
  });

  it("gives a station URL precedence over a concurrent journey URL", async () => {
    searchParams.set("station", saved.from);
    searchParams.set("from", saved.from);
    searchParams.set("to", saved.to);
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Departures" })).toBeInTheDocument());
    expect(requestedDepartures.at(-1)).toEqual({ station: saved.from, active: true });
    expect(requestedJourneys.at(-1)).toBeNull();
  });

  it("activates departures after selecting a station and deactivates it when switching to journeys", async () => {
    render(<Home />);
    const stationBox = screen.getByRole("combobox", { name: "Station" });
    fireEvent.focus(stationBox);
    fireEvent.change(stationBox, { target: { value: "cam" } });
    fireEvent.click(screen.getByRole("option", { name: "Camden Town" }));
    await waitFor(() => expect(requestedDepartures.at(-1)).toEqual({ station: saved.from, active: true }));
    expect(fetchDepartures).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    expect(requestedDepartures.at(-1)).toEqual({ station: saved.from, active: false });
  });

  it("clears a journey URL when history moves to root and leaves no live request active", async () => {
    searchParams.set("from", saved.from);
    searchParams.set("to", saved.to);
    const { rerender } = render(<Home />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Selected journey" })).toBeInTheDocument());
    searchParams.delete("from");
    searchParams.delete("to");
    rerender(<Home />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Station" })).toHaveValue(""));
    expect(screen.getByRole("heading", { name: "Departures" })).toBeInTheDocument();
    expect(requestedJourneys.at(-1)).toBeNull();
    expect(requestedDepartures.at(-1)).toEqual({ station: null, active: false });
  });

  it("clears a station URL when history moves to root and leaves both live hooks inactive", async () => {
    searchParams.set("station", saved.from);
    const { rerender } = render(<Home />);
    await waitFor(() => expect(requestedDepartures.at(-1)).toEqual({ station: saved.from, active: true }));
    searchParams.delete("station");
    rerender(<Home />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Station" })).toHaveValue(""));
    expect(requestedJourneys.at(-1)).toBeNull();
    expect(requestedDepartures.at(-1)).toEqual({ station: null, active: false });
  });

  it("clears live selections when history moves to invalid station or non-direct journey parameters", async () => {
    searchParams.set("station", saved.from);
    const { rerender } = render(<Home />);
    await waitFor(() => expect(requestedDepartures.at(-1)).toEqual({ station: saved.from, active: true }));
    searchParams.set("station", "unknown");
    rerender(<Home />);
    await waitFor(() => expect(requestedDepartures.at(-1)).toEqual({ station: null, active: false }));
    expect(requestedJourneys.at(-1)).toBeNull();

    searchParams.delete("station");
    searchParams.set("from", "940GZZLUBNK");
    searchParams.set("to", "940GZZLUCHX");
    rerender(<Home />);
    await waitFor(() => expect(requestedJourneys.at(-1)).toBeNull());
    expect(requestedDepartures.at(-1)).toEqual({ station: null, active: false });
  });

  it("restores saved journeys on root history but keeps an explicit valid station URL in Departures", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    searchParams.set("station", saved.from);
    const { rerender } = render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Departures" })).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Journeys" })).not.toBeInTheDocument();
    searchParams.delete("station");
    rerender(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument());
    expect(requestedJourneys.at(-1)).toBeNull();
    expect(requestedDepartures.at(-1)).toEqual({ station: null, active: false });
  });

  it("does not expose cached cards after switching to a different route", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    requestState.dataKey = `${saved.from}:${saved.to}`;
    requestState.data = {
      journey: { from: saved.from, to: saved.to }, observedAt: "2026-09-16T12:00:00.000Z", predictionGeneratedAt: null,
      trains: [{ id: "old", destinationName: "Old card", expectedArrival: "2026-09-16T12:01:00.000Z", secondsToOrigin: 60, platform: null, direction: "Northbound", platformConfirmed: false, routeConfidence: "confirmed", via: null, destinationArrival: null, destinationSeconds: null, evidence: "unavailable", }],
      additionalSuitableCount: 0, withheldAmbiguousCount: 0, nextTrainId: "old", fastestTrainId: null, qualification: null, rankings: null, minutesSaved: null,
    };
    render(<Home />);
    await waitFor(() => screen.getByRole("button", { name: "Camden Town → Edgware" }));
    fireEvent.click(screen.getByRole("button", { name: "Camden Town → Edgware" }));
    await waitFor(() => expect(screen.getByText("Old card")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    const boxes = screen.getAllByRole("combobox");
    fireEvent.focus(boxes[0]!);
    fireEvent.change(boxes[0]!, { target: { value: "bank" } });
    fireEvent.click(screen.getByRole("option", { name: "Bank" }));
    fireEvent.focus(boxes[1]!);
    fireEvent.change(boxes[1]!, { target: { value: "edg" } });
    fireEvent.click(screen.getByRole("option", { name: "Edgware" }));
    fireEvent.click(screen.getByRole("button", { name: "Check trains" }));
    await waitFor(() => expect(screen.queryByText("Old card")).not.toBeInTheDocument());
  });

  it("hides the install hint in standalone mode and after session dismissal", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true }) });
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument());
    expect(screen.queryByText(/home screen/)).not.toBeInTheDocument();
  });

  it("keeps cached same-route data stale and hides ranking language during retry", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    requestState.dataKey = `${saved.from}:${saved.to}`;
    requestState.issue = "upstream";
    requestState.data = {
      journey: { from: saved.from, to: saved.to }, observedAt: "2026-09-16T12:00:00.000Z", predictionGeneratedAt: null,
      trains: [{ id: "next", destinationName: "Edgware", expectedArrival: "2026-09-16T12:01:00.000Z", secondsToOrigin: 60, platform: null, direction: "Northbound", platformConfirmed: false, routeConfidence: "confirmed", via: null, destinationArrival: "2026-09-16T12:10:00.000Z", destinationSeconds: 600, evidence: "estimate" }],
      additionalSuitableCount: 0, withheldAmbiguousCount: 0, nextTrainId: "next", fastestTrainId: "next", qualification: "best_arrival", rankings: "best_arrival", minutesSaved: 3,
    };
    render(<Home />);
    await waitFor(() => screen.getByRole("button", { name: "Camden Town → Edgware" }));
    fireEvent.click(screen.getByRole("button", { name: "Camden Town → Edgware" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Last prediction"));
    expect(screen.queryByText("NEXT & BEST ARRIVAL")).not.toBeInTheDocument();
    expect(screen.queryByText("Arrives 3 min earlier")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Last prediction");
  });

  it("keeps a dismissal for the session", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    sessionStorage.setItem("northern-direct:install-dismissed", "1");
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument());
    expect(screen.queryByText(/home screen/)).not.toBeInTheDocument();
  });

  it("restores a removed journey with Undo and expires Undo after five seconds", async () => {
    const other = { from: "940GZZLUACY", to: "940GZZLUBLM", fromName: "Archway", toName: "Balham" };
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved, other]));
    render(<Home />);
    await waitFor(() => screen.getByRole("button", { name: "Camden Town → Edgware" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Camden Town to Edgware" }));
    expect(screen.getByRole("status")).toHaveTextContent("Journey removed");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Camden Town → Edgware" })).toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Remove Camden Town to Edgware" }));
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("offers a real Install button only after beforeinstallprompt is captured", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", { value: prompt });
    window.dispatchEvent(event);
    fireEvent.click(await screen.findByRole("button", { name: "Install" }));
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("shows install guidance after two explicit successful journeys, not background requests", async () => {
    const result = {
      journey: { from: saved.from, to: saved.to }, observedAt: "2026-09-16T12:00:00.000Z", predictionGeneratedAt: null,
      trains: [], additionalSuitableCount: 0, withheldAmbiguousCount: 0, nextTrainId: null, fastestTrainId: null, qualification: null, rankings: null, minutesSaved: null,
    };
    requestState.dataKey = `${saved.from}:${saved.to}`;
    requestState.data = result;
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    const boxes = screen.getAllByRole("combobox");
    fireEvent.focus(boxes[0]!);
    fireEvent.change(boxes[0]!, { target: { value: "cam" } });
    fireEvent.click(screen.getByRole("option", { name: "Camden Town" }));
    fireEvent.focus(boxes[1]!);
    fireEvent.change(boxes[1]!, { target: { value: "edg" } });
    fireEvent.click(screen.getByRole("option", { name: "Edgware" }));
    fireEvent.click(screen.getByRole("button", { name: "Check trains" }));
    await waitFor(() => expect(screen.queryByText(/home screen/)).not.toBeInTheDocument());
    fetchJourney(); // background-like refresh must not count as an explicit success.
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    const changed = screen.getAllByRole("combobox");
    fireEvent.focus(changed[0]!);
    fireEvent.change(changed[0]!, { target: { value: "bank" } });
    fireEvent.click(screen.getByRole("option", { name: "Bank" }));
    requestState.dataKey = "940GZZLUBNK:940GZZLUEGW";
    fireEvent.click(screen.getByRole("button", { name: "Check trains" }));
    await waitFor(() => expect(screen.getByText(/home screen/)).toBeInTheDocument());
  });

  it("makes the install hint eligible immediately after the first saved journey", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    const boxes = screen.getAllByRole("combobox");
    fireEvent.focus(boxes[0]!);
    fireEvent.change(boxes[0]!, { target: { value: "cam" } });
    fireEvent.click(screen.getByRole("option", { name: "Camden Town" }));
    fireEvent.focus(boxes[1]!);
    fireEvent.change(boxes[1]!, { target: { value: "edg" } });
    fireEvent.click(screen.getByRole("option", { name: "Edgware" }));
    fireEvent.click(screen.getByRole("button", { name: "Check trains" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save journey" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save journey" }));
    await waitFor(() => expect(screen.getByText(/home screen/)).toBeInTheDocument());
  });

  it("names the oldest route for ninth-save confirmation and cancel is a no-op", async () => {
    const routes = [
      { from: "940GZZLUAGL", to: "940GZZLUACY", fromName: "Angel", toName: "Archway" },
      { from: "940GZZLUACY", to: "940GZZLUBLM", fromName: "Archway", toName: "Balham" },
      { from: "940GZZLUAGL", to: "940GZZLUBLM", fromName: "Angel", toName: "Balham" },
      { from: "940GZZLUBLM", to: "940GZZLUAGL", fromName: "Balham", toName: "Angel" },
      { from: "940GZZLUACY", to: "940GZZLUBNK", fromName: "Archway", toName: "Bank" },
      { from: "940GZZLUBNK", to: "940GZZLUACY", fromName: "Bank", toName: "Archway" },
      { from: "940GZZLUAGL", to: "940GZZLUBNK", fromName: "Angel", toName: "Bank" },
      { from: "940GZZLUBNK", to: "940GZZLUAGL", fromName: "Bank", toName: "Angel" },
    ];
    localStorage.setItem("northern-direct:journeys", JSON.stringify(routes));
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "New journey" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "New journey" }));
    const boxes = screen.getAllByRole("combobox");
    fireEvent.focus(boxes[0]!);
    fireEvent.change(boxes[0]!, { target: { value: "cam" } });
    fireEvent.click(screen.getByRole("option", { name: "Camden Town" }));
    fireEvent.focus(boxes[1]!);
    fireEvent.change(boxes[1]!, { target: { value: "edg" } });
    fireEvent.click(screen.getByRole("option", { name: "Edgware" }));
    fireEvent.click(screen.getByRole("button", { name: "Check trains" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save journey" })).toBeInTheDocument());
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Save journey" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Bank to Angel"));
    expect(JSON.parse(localStorage.getItem("northern-direct:journeys") ?? "[]")).toHaveLength(8);
    confirm.mockRestore();
  });

  it("refreshes once when the highlighted train expires, not for an old following train", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    requestState.dataKey = `${saved.from}:${saved.to}`;
    requestState.data = {
      journey: { from: saved.from, to: saved.to }, observedAt: "2026-09-16T12:00:00.000Z", predictionGeneratedAt: null,
      trains: [
        { id: "next", destinationName: "Edgware", expectedArrival: "2026-09-16T12:00:00.000Z", secondsToOrigin: 0, platform: null, direction: "Northbound", platformConfirmed: false, routeConfidence: "confirmed", via: null, destinationArrival: null, destinationSeconds: null, evidence: "unavailable" },
        { id: "following", destinationName: "Edgware", expectedArrival: "2026-09-16T11:58:00.000Z", secondsToOrigin: -120, platform: null, direction: "Northbound", platformConfirmed: false, routeConfidence: "confirmed", via: null, destinationArrival: null, destinationSeconds: null, evidence: "unavailable" },
      ],
      additionalSuitableCount: 0, withheldAmbiguousCount: 0, nextTrainId: "next", fastestTrainId: null, qualification: null, rankings: null, minutesSaved: null,
    };
    render(<Home />);
    await act(async () => { vi.advanceTimersByTime(0); });
    fireEvent.click(screen.getByRole("button", { name: "Camden Town → Edgware" }));
    await act(async () => { vi.advanceTimersByTime(0); });
    fetchJourney.mockClear();
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(fetchJourney).toHaveBeenCalledTimes(1);
  });
});
