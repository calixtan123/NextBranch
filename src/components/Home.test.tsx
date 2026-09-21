import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";
import { STATIONS_STORAGE_KEY } from "@/lib/storage/stations";

const fetchJourney = vi.hoisted(() => vi.fn());
const requestedJourneys = vi.hoisted(() => [] as Array<{ from: string; to: string } | null>);
const requestState = vi.hoisted(() => ({ data: null as Record<string, unknown> | null, dataKey: null as string | null, loading: false, issue: null as string | null, cooldownUntil: 0 }));
const fetchDepartures = vi.hoisted(() => vi.fn());
const requestedDepartures = vi.hoisted(() => [] as Array<{ station: string | null; active: boolean }>);
const departureState = vi.hoisted(() => ({ data: null as Record<string, unknown> | null, loading: false, issue: null as string | null, cooldownUntil: 0 }));
const searchParams = vi.hoisted(() => new URLSearchParams());
const routerPush = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: routerPush }),
}));
vi.mock("./useJourneyRequest", () => ({
  useJourneyRequest: (journey: { from: string; to: string } | null) => { requestedJourneys.push(journey); return { ...requestState, data: journey && requestState.dataKey === `${journey.from}:${journey.to}` ? requestState.data : null, fetchJourney }; },
}));
vi.mock("./useDeparturesRequest", () => ({
  useDeparturesRequest: (station: string | null, active: boolean) => { requestedDepartures.push({ station, active }); return { ...departureState, fetchDepartures }; },
}));

const saved = { from: "940GZZLUCTN", to: "940GZZLUEGW", fromName: "Camden Town", toName: "Edgware" };
const savedStation = { id: "940GZZLUCTN", name: "Camden Town", lastUsedAt: 200 };
const recentStation = { id: "940GZZLUAGL", name: "Angel", lastUsedAt: 100 };
const stationSelectionAt = 1_789_819_200_000;
const defaultUserAgent = navigator.userAgent;
const defaultVendor = navigator.vendor;
const defaultGeolocation = navigator.geolocation;

describe("Home", () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "clipboard");
  });
  beforeEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const makeStorage = () => {
      const values = new Map<string, string>();
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
        clear: () => { values.clear(); },
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() { return values.size; },
      } as Storage;
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: makeStorage() });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: makeStorage() });
    fetchJourney.mockReset();
    requestedJourneys.length = 0;
    fetchDepartures.mockReset();
    routerPush.mockReset();
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
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: defaultUserAgent });
    Object.defineProperty(navigator, "vendor", { configurable: true, value: defaultVendor });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: defaultGeolocation });
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

  // Break: stored stations select and fetch a live board before the passenger explicitly chooses one.
  it("shows canonical saved and recent station controls at startup without activating departures", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify({ saved: [savedStation], recent: [recentStation] }));
    render(<Home />);

    const stationList = await screen.findByRole("list", { name: "Saved and recent stations" });
    const choiceButtons = within(stationList).getAllByRole("button").filter((button) => button.textContent === "Camden Town" || button.textContent === "Angel");
    expect(choiceButtons.map((button) => button.textContent)).toEqual(["Camden Town", "Angel"]);
    expect(within(stationList).getByRole("button", { name: "Unsave Camden Town" })).toBeInTheDocument();
    expect(within(stationList).getByRole("button", { name: "Save Angel" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Station" })).toHaveValue("");
    expect(fetchDepartures).not.toHaveBeenCalled();
    expect(requestedDepartures.at(-1)).toEqual({ station: null, active: false });
  });

  // Break: a selected board lacks a share action, or a total sharing failure hides its useful departures.
  it("shares an active station without discarding visible departure results when sharing fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
    searchParams.set("station", saved.from);
    departureState.data = {
      station: { id: saved.from, name: saved.fromName }, observedAt: "2026-09-16T12:00:00.000Z",
      newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
      platforms: [{ platform: "1", direction: "Northbound", departures: [{ id: "one", destinationName: "Edgware", expectedArrival: "2026-09-16T12:02:00.000Z", secondsToStation: 120, towards: null }] }],
    };
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue(new Error("Share unavailable")) });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard unavailable")) } });
    render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(screen.getByText("Edgware")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Share Camden Town departures" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to share link.");
    expect(screen.getByText("Edgware")).toBeInTheDocument();
  });

  // Break: chooser and saved-route screens offer links for inactive selections, or active journey results lack sharing.
  it("offers sharing only for an active station or activated journey", () => {
    const stationMount = render(<Home />);
    expect(screen.queryByRole("button", { name: /Share/ })).not.toBeInTheDocument();
    stationMount.unmount();

    searchParams.set("station", saved.from);
    const activeStationMount = render(<Home />);
    expect(screen.getByRole("button", { name: "Share Camden Town departures" })).toBeInTheDocument();
    activeStationMount.unmount();

    searchParams.delete("station");
    searchParams.set("from", saved.from);
    searchParams.set("to", saved.to);
    render(<Home />);
    expect(screen.getByRole("button", { name: "Share Camden Town to Edgware journey" })).toBeInTheDocument();
  });

  // Break: a clean shared board cannot be saved without reselecting it, or persistence refetches/recreates removed history.
  it("saves a clean shared station board, survives remount, and stays removed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00.000Z"));
    searchParams.set("station", savedStation.id);
    const firstMount = render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchDepartures).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Save station" }));
    expect(fetchDepartures).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}")).toEqual({
      saved: [{ ...savedStation, lastUsedAt: stationSelectionAt }],
      recent: [],
    });
    firstMount.unmount();

    fetchDepartures.mockClear();
    const secondMount = render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByRole("button", { name: "Save station" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unsave Camden Town" })).toBeInTheDocument();
    expect(fetchDepartures).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove Camden Town" }));
    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}")).toEqual({ saved: [], recent: [] });
    secondMount.unmount();

    render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole("button", { name: "Save station" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unsave Camden Town" })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}")).toEqual({ saved: [], recent: [] });
  });

  // Break: Undo after saving a never-stored shared station incorrectly demotes it into Recent.
  it("undoes a clean shared station save back to no stored membership", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00.000Z"));
    searchParams.set("station", savedStation.id);
    render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fetchDepartures.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Save station" }));
    fireEvent.click(within(screen.getByRole("status", { name: "Station actions" })).getByRole("button", { name: "Undo" }));

    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}")).toEqual({ saved: [], recent: [] });
    expect(screen.getByRole("button", { name: "Save station" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Saved and recent stations" })).not.toBeInTheDocument();
    expect(fetchDepartures).not.toHaveBeenCalled();
  });

  // Break: saving a shared station at capacity permanently loses the row displaced by the save after Undo.
  it("restores the displaced station when undoing an active-board save at capacity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00.000Z"));
    const initial = {
      saved: [],
      recent: [
        recentStation,
        { id: "940GZZLUACY", name: "Archway", lastUsedAt: 90 },
        { id: "940GZZLUBLM", name: "Balham", lastUsedAt: 80 },
        { id: "940GZZLUBNK", name: "Bank", lastUsedAt: 70 },
        { id: "940GZZLUEGW", name: "Edgware", lastUsedAt: 60 },
      ],
    };
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify(initial));
    searchParams.set("station", savedStation.id);
    render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    fireEvent.click(screen.getByRole("button", { name: "Save station" }));
    fireEvent.click(within(screen.getByRole("status", { name: "Station actions" })).getByRole("button", { name: "Undo" }));

    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}")).toEqual(initial);
  });

  // Break: saving a recent row looks successful but disappears after the next client mount.
  it("saves a recent station and preserves its membership after remount", async () => {
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify({ saved: [], recent: [savedStation] }));
    const firstMount = render(<Home />);
    await screen.findByRole("button", { name: "Save Camden Town" });

    fireEvent.click(screen.getByRole("button", { name: "Save Camden Town" }));
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}" )).toMatchObject({
        saved: [{ id: savedStation.id, name: savedStation.name }],
        recent: [],
      });
    });
    firstMount.unmount();

    render(<Home />);
    expect(await screen.findByRole("button", { name: "Unsave Camden Town" })).toBeInTheDocument();
    expect(fetchDepartures).not.toHaveBeenCalled();
  });

  // Break: a key-blind storage double hides accidental overlap between the station and journey envelopes.
  it("keeps station and journey storage independent across a station mutation and remount", async () => {
    const journeyEnvelope = JSON.stringify([saved]);
    const stationEnvelope = JSON.stringify({ saved: [savedStation], recent: [recentStation] });
    localStorage.setItem("northern-direct:journeys", journeyEnvelope);
    localStorage.setItem(STATIONS_STORAGE_KEY, stationEnvelope);
    expect(localStorage.getItem("northern-direct:journeys")).toBe(journeyEnvelope);
    expect(localStorage.getItem(STATIONS_STORAGE_KEY)).toBe(stationEnvelope);

    const firstMount = render(<Home />);
    await screen.findByRole("button", { name: "Unsave Camden Town" });
    fireEvent.click(screen.getByRole("button", { name: "Unsave Camden Town" }));
    expect(localStorage.getItem("northern-direct:journeys")).toBe(journeyEnvelope);
    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}" )).toEqual({
      saved: [],
      recent: [savedStation, recentStation],
    });

    firstMount.unmount();
    render(<Home />);
    await screen.findByRole("button", { name: "Save Camden Town" });
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    expect(await screen.findByRole("button", { name: "Camden Town → Edgware" })).toBeInTheDocument();
    expect(localStorage.getItem("northern-direct:journeys")).toBe(journeyEnvelope);
  });

  // Break: Unsaving loses the saved timestamp, so Undo cannot restore the user's original membership metadata.
  it("unsaves a station and Undo restores its original saved membership and timestamp", async () => {
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify({ saved: [savedStation], recent: [recentStation] }));
    render(<Home />);
    await screen.findByRole("button", { name: "Unsave Camden Town" });

    fireEvent.click(screen.getByRole("button", { name: "Unsave Camden Town" }));
    expect(screen.getByRole("status", { name: "Station actions" })).toHaveTextContent("Station unsaved");
    expect(screen.getByRole("button", { name: "Save Camden Town" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}" )).toEqual({ saved: [], recent: [savedStation, recentStation] });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Unsave Camden Town" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}" )).toEqual({ saved: [savedStation], recent: [recentStation] });
  });

  // Break: a URL update rehydrates a stale readable envelope after a denied write and overwrites the current-page station choice.
  it("keeps an in-memory unsaved station after a station URL update when storage writes fail", async () => {
    vi.useFakeTimers();
    const staleEnvelope = JSON.stringify({ saved: [savedStation], recent: [recentStation] });
    const deniedWrites = {
      getItem: (key: string) => key === STATIONS_STORAGE_KEY ? staleEnvelope : null,
      setItem: () => { throw new Error("storage disabled"); },
      removeItem: () => { throw new Error("storage disabled"); },
    } as unknown as Storage;
    Object.defineProperty(window, "localStorage", { configurable: true, value: deniedWrites });
    const { rerender } = render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole("button", { name: "Unsave Camden Town" }));
    expect(screen.getByRole("button", { name: "Save Camden Town" })).toBeInTheDocument();

    searchParams.set("station", savedStation.id);
    rerender(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(screen.getByRole("button", { name: "Save Camden Town" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unsave Camden Town" })).not.toBeInTheDocument();
  });

  it("keeps an in-memory unsaved station after a station URL update when storage reads fail", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify({ saved: [savedStation], recent: [recentStation] }));
    const { rerender } = render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const deniedStorage = {
      getItem: () => { throw new Error("storage disabled"); },
      setItem: () => { throw new Error("storage disabled"); },
      removeItem: () => { throw new Error("storage disabled"); },
    } as unknown as Storage;
    Object.defineProperty(window, "localStorage", { configurable: true, value: deniedStorage });

    fireEvent.click(screen.getByRole("button", { name: "Unsave Camden Town" }));
    expect(screen.getByRole("button", { name: "Save Camden Town" })).toBeInTheDocument();

    searchParams.set("station", savedStation.id);
    rerender(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(screen.getByRole("button", { name: "Save Camden Town" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unsave Camden Town" })).not.toBeInTheDocument();
  });

  // Break: a selection before deferred hydration writes from the empty initial collection and erases an existing saved station.
  it("merges an immediate station selection with stored history before deferred hydration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00.000Z"));
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify({ saved: [savedStation], recent: [] }));
    render(<Home />);

    const stationBox = screen.getByRole("combobox", { name: "Station" });
    fireEvent.focus(stationBox);
    fireEvent.change(stationBox, { target: { value: "edg" } });
    fireEvent.click(screen.getByRole("option", { name: "Edgware" }));

    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}" )).toEqual({
      saved: [savedStation],
      recent: [{ id: "940GZZLUEGW", name: "Edgware", lastUsedAt: stationSelectionAt }],
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole("button", { name: "Unsave Camden Town" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Edgware" })).toBeInTheDocument();
  });

  // Break: storage hydration can cancel a pending station URL timer after the URL has already been marked as handled.
  it("applies a station URL changed before initial station storage hydration finishes", async () => {
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify({ saved: [savedStation], recent: [] }));
    const timers: Array<{ callback: () => void; cancelled: boolean }> = [];
    const originalSetTimeout = window.setTimeout;
    const originalClearTimeout = window.clearTimeout;
    window.setTimeout = ((callback: () => void) => {
      timers.push({ callback, cancelled: false });
      return timers.length;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id: number) => {
      const timer = timers[id - 1];
      if (timer) timer.cancelled = true;
    }) as typeof window.clearTimeout;

    try {
      const { rerender } = render(<Home />);
      searchParams.set("station", saved.to);
      rerender(<Home />);

      for (let index = 0; index < timers.length; index += 1) {
        const timer = timers[index]!;
        if (!timer.cancelled) await act(async () => { timer.callback(); });
      }

      expect(screen.getByRole("combobox", { name: "Station" })).toHaveValue("Edgware");
      expect(requestedDepartures.at(-1)).toEqual({ station: saved.to, active: true });
    } finally {
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
    }
  });

  // Break: removing a station either retains it in hidden storage or leaves its Undo action available forever.
  it("removes a station completely and expires the station Undo after five seconds", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify({ saved: [], recent: [savedStation] }));
    render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole("button", { name: "Remove Camden Town" }));

    expect(screen.getByRole("status", { name: "Station actions" })).toHaveTextContent("Station removed");
    expect(screen.queryByRole("button", { name: /^Camden Town$/ })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}" )).toEqual({ saved: [], recent: [] });
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("restores an old station at capacity and evicts the lowest-priority replacement row", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00.000Z"));
    const archway = { id: "940GZZLUACY", name: "Archway", lastUsedAt: 90 };
    const balham = { id: "940GZZLUBLM", name: "Balham", lastUsedAt: 80 };
    const bank = { id: "940GZZLUBNK", name: "Bank", lastUsedAt: 70 };
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify({ saved: [], recent: [savedStation, recentStation, archway, balham, bank] }));
    render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    fireEvent.click(screen.getByRole("button", { name: "Remove Bank" }));
    const stationBox = screen.getByRole("combobox", { name: "Station" });
    fireEvent.focus(stationBox);
    fireEvent.change(stationBox, { target: { value: "edg" } });
    fireEvent.click(screen.getByRole("option", { name: "Edgware" }));
    fireEvent.click(within(screen.getByRole("status", { name: "Station actions" })).getByRole("button", { name: "Undo" }));

    expect(screen.getByRole("button", { name: "Save Bank" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Balham" })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}" )).toEqual({
      saved: [],
      recent: [
        { id: "940GZZLUEGW", name: "Edgware", lastUsedAt: stationSelectionAt },
        savedStation,
        recentStation,
        archway,
        bank,
      ],
    });
  });

  it("keeps station and journey Undo controls independent when both actions are pending", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify({ saved: [savedStation], recent: [recentStation] }));
    render(<Home />);
    await screen.findByRole("button", { name: "Unsave Camden Town" });

    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    await screen.findByRole("button", { name: "Camden Town → Edgware" });
    fireEvent.click(screen.getByRole("button", { name: "Remove Camden Town to Edgware" }));
    fireEvent.click(screen.getByRole("button", { name: "Departures" }));
    fireEvent.click(screen.getByRole("button", { name: "Unsave Camden Town" }));

    const stationUndo = screen.getByRole("status", { name: "Station actions" });
    const journeyUndo = screen.getAllByRole("status").find((status) => status.textContent?.includes("Journey removed"));
    expect(journeyUndo).toBeDefined();
    fireEvent.click(within(stationUndo).getByRole("button", { name: "Undo" }));
    expect(journeyUndo).toBeInTheDocument();
    fireEvent.click(within(journeyUndo!).getByRole("button", { name: "Undo" }));

    expect(JSON.parse(localStorage.getItem(STATIONS_STORAGE_KEY) ?? "{}" )).toEqual({ saved: [savedStation], recent: [recentStation] });
    fireEvent.click(screen.getByRole("button", { name: "Journeys" }));
    expect(await screen.findByRole("button", { name: "Camden Town → Edgware" })).toBeInTheDocument();
  });

  it("restarts station Undo expiry from a newer station action", async () => {
    vi.useFakeTimers();
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify({ saved: [savedStation], recent: [recentStation] }));
    render(<Home />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByRole("button", { name: "Unsave Camden Town" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    fireEvent.click(screen.getByRole("button", { name: "Remove Angel" }));

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByRole("status", { name: "Station actions" })).toHaveTextContent("Station removed");
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(screen.queryByRole("status", { name: "Station actions" })).not.toBeInTheDocument();
  });

  // Break: local station history overrides a valid deep link, or root history ignores local station rows after navigation.
  it("gives station and journey deep links precedence over local stations before returning to the chooser", async () => {
    localStorage.setItem(STATIONS_STORAGE_KEY, JSON.stringify({ saved: [savedStation], recent: [recentStation] }));
    searchParams.set("from", saved.from);
    searchParams.set("to", saved.to);
    const { rerender } = render(<Home />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Selected journey" })).toBeInTheDocument());
    expect(requestedDepartures.at(-1)).toEqual({ station: null, active: false });

    searchParams.set("station", savedStation.id);
    rerender(<Home />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Station" })).toHaveValue("Camden Town"));
    expect(requestedJourneys.at(-1)).toBeNull();

    searchParams.delete("station");
    searchParams.delete("from");
    searchParams.delete("to");
    rerender(<Home />);
    expect(await screen.findByRole("list", { name: "Saved and recent stations" })).toBeInTheDocument();
    await waitFor(() => expect(requestedDepartures.at(-1)).toEqual({ station: null, active: false }));
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

  // Break: nearest-station location data is persisted or added to a navigation URL instead of staying browser-local.
  it("opens the canonical nearest-station view and records only the station choice", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({
      coords: { latitude: 51.5393, longitude: -0.1427, accuracy: 20 },
    } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "Use nearest station" }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/?station=940GZZLUCTN"));
    expect(requestedDepartures.at(-1)).toEqual({ station: "940GZZLUCTN", active: true });
    const stored = localStorage.getItem(STATIONS_STORAGE_KEY) ?? "";
    expect(stored).toContain('"id":"940GZZLUCTN"');
    expect(stored).not.toContain("latitude");
    expect(stored).not.toContain("longitude");
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

  // Break: an install event captured before deferred initialization bypasses an existing session dismissal.
  it("keeps session dismissal when a prompt arrives during initialization", async () => {
    vi.useFakeTimers();
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    sessionStorage.setItem("northern-direct:install-dismissed", "1");
    render(<Home />);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", { value: () => Promise.resolve() });
    Object.defineProperty(event, "userChoice", { value: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  // Break: initialization downgrades an appinstalled terminal state, allowing a later prompt to reappear.
  it("keeps installed state when appinstalled arrives during initialization", async () => {
    vi.useFakeTimers();
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    render(<Home />);
    window.dispatchEvent(new Event("appinstalled"));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", { value: () => Promise.resolve() });
    Object.defineProperty(event, "userChoice", { value: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
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

  it("captures beforeinstallprompt before exposing a Chromium installation route", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", { value: () => Promise.resolve() });
    Object.defineProperty(event, "userChoice", { value: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(await screen.findByRole("button", { name: "Install" })).toBeInTheDocument();
  });

  // Break: a consumed browser prompt leaves an active button, so users can try to reuse it.
  it("shows a prompting state and consumes the browser prompt after Install is selected", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument());
    let resolvePrompt: (() => void) | undefined;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", { value: () => new Promise<void>((resolve) => { resolvePrompt = resolve; }) });
    Object.defineProperty(event, "userChoice", { value: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);

    fireEvent.click(await screen.findByRole("button", { name: "Install" }));
    expect(screen.getByRole("button", { name: "Installing…" })).toBeDisabled();

    resolvePrompt?.();
    await waitFor(() => expect(screen.queryByText(/home screen/)).not.toBeInTheDocument());
  });

  // Break: iOS Safari users receive no safe manual installation route when Chromium's event is unavailable.
  it("shows Safari Share then Add to Home Screen instructions for eligible iOS Safari users", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
    Object.defineProperty(navigator, "vendor", { configurable: true, value: "Apple Computer, Inc." });
    render(<Home />);

    expect(await screen.findByText(/In Safari, tap Share, then Add to Home Screen\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  // Break: a rejected native prompt becomes an unhandled rejection or leaves unusable installation UI behind.
  it("hides installation guidance when the browser prompt rejects", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument());
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", { value: () => Promise.reject(new Error("prompt unavailable")) });
    Object.defineProperty(event, "userChoice", { value: Promise.resolve({ outcome: "dismissed" }) });
    window.dispatchEvent(event);

    fireEvent.click(await screen.findByRole("button", { name: "Install" }));
    await waitFor(() => expect(screen.queryByText(/home screen/)).not.toBeInTheDocument());
  });

  // Break: native dismissal continues to advertise an installation action the browser has already declined.
  it("hides installation guidance after a dismissed browser prompt", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument());
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", { value: () => Promise.resolve() });
    Object.defineProperty(event, "userChoice", { value: Promise.resolve({ outcome: "dismissed" }) });
    window.dispatchEvent(event);

    fireEvent.click(await screen.findByRole("button", { name: "Install" }));
    await waitFor(() => expect(screen.queryByText(/home screen/)).not.toBeInTheDocument());
  });

  // Break: an installed app continues to offer setup instructions, or unsupported browsers are advertised as installable.
  it("hides guidance after appinstalled and does not show unsupported browsers an install route", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
    expect(screen.queryByText(/In Safari, tap Share/)).not.toBeInTheDocument();

    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", { value: () => Promise.resolve() });
    Object.defineProperty(event, "userChoice", { value: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);
    expect(await screen.findByRole("button", { name: "Install" })).toBeInTheDocument();
    window.dispatchEvent(new Event("appinstalled"));
    await waitFor(() => expect(screen.queryByText(/home screen/)).not.toBeInTheDocument());
  });

  // Break: switching into standalone display mode after startup leaves install guidance visible.
  it("hides guidance when standalone display mode changes after startup", async () => {
    localStorage.setItem("northern-direct:journeys", JSON.stringify([saved]));
    let onDisplayModeChange: ((event: MediaQueryListEvent) => void) | undefined;
    let standalone = false;
    const mediaQuery = {
      get matches() { return standalone; },
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { onDisplayModeChange = listener; },
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => mediaQuery });
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Journeys" })).toBeInTheDocument());

    const installEvent = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(installEvent, "prompt", { value: () => Promise.resolve() });
    Object.defineProperty(installEvent, "userChoice", { value: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(installEvent);
    expect(await screen.findByRole("button", { name: "Install" })).toBeInTheDocument();

    standalone = true;
    onDisplayModeChange?.({ matches: true } as MediaQueryListEvent);
    await waitFor(() => expect(screen.queryByText(/home screen/)).not.toBeInTheDocument());
  });

  it("shows install guidance after two explicit successful journeys, not background requests", async () => {
    const result = {
      journey: { from: saved.from, to: saved.to }, observedAt: "2026-09-16T12:00:00.000Z", predictionGeneratedAt: null,
      trains: [], additionalSuitableCount: 0, withheldAmbiguousCount: 0, nextTrainId: null, fastestTrainId: null, qualification: null, rankings: null, minutesSaved: null,
    };
    requestState.dataKey = `${saved.from}:${saved.to}`;
    requestState.data = result;
    render(<Home />);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", { value: () => Promise.resolve() });
    Object.defineProperty(event, "userChoice", { value: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);
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
    await waitFor(() => expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument());
  });

  it("makes the install hint eligible immediately after the first saved journey", async () => {
    render(<Home />);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(event, "prompt", { value: () => Promise.resolve() });
    Object.defineProperty(event, "userChoice", { value: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);
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
    await waitFor(() => expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument());
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
