"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Combobox from "./Combobox";
import DepartureBoard from "./DepartureBoard";
import InstallHint from "./InstallHint";
import ShareControl from "./ShareControl";
import TrainCard from "./TrainCard";
import { useDeparturesRequest } from "./useDeparturesRequest";
import { useJourneyRequest } from "./useJourneyRequest";
import { directDestinations } from "@/lib/northern/direct-destinations";
import { byId, type Station } from "@/lib/northern/stations";
import { secondsToOrigin } from "@/lib/northern/time";
import type { Journey } from "@/lib/journeys/types";
import { readJourneys, removeJourney, restoreJourney, saveJourney, willReplaceOldest } from "@/lib/storage/journeys";
import {
  displayStations,
  readStations,
  recordRecentStation,
  removeStation,
  restoreStation,
  saveStation,
  unsaveStation,
  writeStations,
  type SavedStation,
  type StationCollection,
  type StationMembership,
} from "@/lib/storage/stations";

const fromUrl = (value: string | null) => value ? byId.get(value) ?? null : null;
type View = "departures" | "search" | "journeys" | "results";
type StationUndo = {
  id: number;
  station: SavedStation;
  membership: StationMembership;
  message: string;
};

/** Coordinates the departure board, local station choices, route planner, and saved journeys. */
export default function Home() {
  const params = useSearchParams();
  const router = useRouter();
  const urlKey = params.toString();
  const urlStation = fromUrl(params.get("station"));
  const initialFrom = fromUrl(params.get("from"));
  const initialTo = fromUrl(params.get("to"));
  const validUrlJourney = Boolean(initialFrom && initialTo && initialFrom.id !== initialTo.id && directDestinations(initialFrom).some((station) => station.id === initialTo.id));
  const [from, setFrom] = useState<Station | null>(initialFrom);
  const [to, setTo] = useState<Station | null>(initialTo);
  const [boardStation, setBoardStation] = useState<Station | null>(urlStation);
  const [saved, setSaved] = useState<Journey[]>([]);
  const [stationCollection, setStationCollection] = useState<StationCollection>({ saved: [], recent: [] });
  const [view, setView] = useState<View>(() => urlStation ? "departures" : validUrlJourney ? "results" : "departures");
  const [hydrated, setHydrated] = useState(false);
  const [activated, setActivated] = useState<{ from: string; to: string } | null>(() => validUrlJourney ? { from: initialFrom!.id, to: initialTo!.id } : null);
  const [now, setNow] = useState<number | null>(null);
  const [journeyUndo, setJourneyUndo] = useState<{ journey: Journey; index: number } | null>(null);
  const [stationUndo, setStationUndo] = useState<StationUndo | null>(null);
  const [successes, setSuccesses] = useState(0);
  const explicitPending = useRef(false);
  const viewTouched = useRef(false);
  const previousUrlKey = useRef(urlKey);
  const latestUrlSelection = useRef({ hasStation: Boolean(urlStation), hasJourney: validUrlJourney });
  const stationCollectionRef = useRef<StationCollection>({ saved: [], recent: [] });
  const stationStorageInitialized = useRef(false);
  const stationUndoSequence = useRef(0);
  const journey = useMemo(() => from && to ? { from: from.id, to: to.id, fromName: from.name, toName: to.name } : null, [from, to]);
  const activeJourney = useMemo(() => activated && journey && activated.from === journey.from && activated.to === journey.to ? journey : null, [activated, journey]);
  const stationRows = useMemo(() => displayStations(stationCollection), [stationCollection]);
  const routeRequest = useJourneyRequest(view === "results" ? activeJourney : null);
  const departureRequest = useDeparturesRequest(boardStation?.id ?? null, view === "departures" && Boolean(boardStation));
  const { data, loading, issue, fetchJourney, cooldownUntil } = routeRequest;
  const { data: departures, loading: departuresLoading, issue: departuresIssue, fetchDepartures, cooldownUntil: departuresCooldown } = departureRequest;
  const hasLiveData = (view === "results" && Boolean(data)) || (view === "departures" && Boolean(departures));
  const activeCooldown = view === "departures" ? departuresCooldown : view === "results" ? cooldownUntil : 0;
  const expiredRefresh = useRef("");
  const clearJourneyUndo = useCallback(() => setJourneyUndo(null), []);
  const clearStationUndo = useCallback(() => setStationUndo(null), []);

  useEffect(() => {
    latestUrlSelection.current = { hasStation: Boolean(urlStation), hasJourney: validUrlJourney };
  }, [urlStation, validUrlJourney]);

  // Browser history can change search parameters without remounting this client
  // component. Treat an explicit URL as the source of truth for live views.
  useEffect(() => {
    if (previousUrlKey.current === urlKey) return;
    const timer = window.setTimeout(() => {
      if (urlStation) {
        setBoardStation((current) => current?.id === urlStation.id ? current : urlStation);
        setActivated((current) => current === null ? current : null);
        setView((current) => current === "departures" ? current : "departures");
      } else if (validUrlJourney && initialFrom && initialTo) {
        setFrom((current) => current?.id === initialFrom.id ? current : initialFrom);
        setTo((current) => current?.id === initialTo.id ? current : initialTo);
        setBoardStation((current) => current === null ? current : null);
        setActivated((current) => current?.from === initialFrom.id && current.to === initialTo.id ? current : { from: initialFrom.id, to: initialTo.id });
        setView((current) => current === "results" ? current : "results");
      } else {
        setFrom((current) => current === null ? current : null);
        setTo((current) => current === null ? current : null);
        setBoardStation((current) => current === null ? current : null);
        setActivated((current) => current === null ? current : null);
        const defaultView = stationRows.length ? "departures" : saved.length ? "journeys" : "departures";
        setView((current) => current === defaultView ? current : defaultView);
      }
      previousUrlKey.current = urlKey;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialFrom, initialTo, saved.length, stationRows.length, urlKey, urlStation, validUrlJourney]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const journeys = readJourneys();
      const stations = stationStorageInitialized.current ? stationCollectionRef.current : readStations();
      stationStorageInitialized.current = true;
      stationCollectionRef.current = stations;
      setSaved(journeys);
      setStationCollection(stations);
      const { hasStation, hasJourney } = latestUrlSelection.current;
      if (!viewTouched.current && !hasStation && !hasJourney) {
        setView(displayStations(stations).length ? "departures" : journeys.length ? "journeys" : "departures");
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!hasLiveData) return;
    let interval: number | undefined;
    const syncVisibility = () => {
      window.clearInterval(interval);
      interval = undefined;
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      interval = window.setInterval(() => setNow(Date.now()), 1_000);
    };
    // Defer the initial update, keeping the server and first browser render equal.
    const initial = window.setTimeout(syncVisibility, 0);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [hasLiveData]);
  useEffect(() => {
    if (hasLiveData || !activeCooldown) return;
    // Empty views need only a cooldown expiry, not a repeating countdown clock.
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const expiry = window.setTimeout(() => setNow(Date.now()), Math.max(0, activeCooldown - Date.now()));
    return () => { window.clearTimeout(initial); window.clearTimeout(expiry); };
  }, [activeCooldown, hasLiveData]);
  useEffect(() => {
    if (!data || issue || !explicitPending.current) return;
    explicitPending.current = false;
    const timer = window.setTimeout(() => setSuccesses((count) => count + 1), 0);
    return () => window.clearTimeout(timer);
  }, [data, issue]);
  const navigateView = (next: View) => { viewTouched.current = true; setView(next); };
  const showDepartures = () => navigateView("departures");
  const showJourneys = () => navigateView(saved.length ? "journeys" : "search");
  const activate = (next: Journey) => { explicitPending.current = true; setFrom(byId.get(next.from) ?? null); setTo(byId.get(next.to) ?? null); setActivated({ from: next.from, to: next.to }); navigateView("results"); router.push(`/?from=${next.from}&to=${next.to}`); };
  useEffect(() => { if (view === "results" && activeJourney) void fetchJourney(); }, [view, activeJourney, fetchJourney]);
  useEffect(() => { if (view === "departures" && boardStation) void fetchDepartures(); }, [view, boardStation, fetchDepartures]);
  const submit = () => { if (!journey || validation) return; explicitPending.current = true; setActivated({ from: journey.from, to: journey.to }); navigateView("results"); router.push(`/?from=${journey.from}&to=${journey.to}`); };
  const updateStationCollection = useCallback((update: (current: StationCollection) => StationCollection) => {
    const current = stationStorageInitialized.current ? stationCollectionRef.current : readStations();
    const next = writeStations(update(current));
    stationStorageInitialized.current = true;
    stationCollectionRef.current = next;
    setStationCollection(next);
  }, []);
  const queueStationUndo = useCallback((station: SavedStation, membership: StationMembership, message: string) => {
    stationUndoSequence.current += 1;
    setStationUndo({ id: stationUndoSequence.current, station, membership, message });
  }, []);
  const selectBoardStation = useCallback((station: Station | null) => {
    setBoardStation(station);
    if (!station) return;
    updateStationCollection((current) => recordRecentStation(current, station.id, Date.now()));
    router.push(`/?station=${station.id}`);
  }, [router, updateStationCollection]);
  const saveStationRow = useCallback((station: SavedStation) => {
    updateStationCollection((current) => saveStation(current, station.id, Date.now()));
    queueStationUndo(station, "recent", "Station saved.");
  }, [queueStationUndo, updateStationCollection]);
  const unsaveStationRow = (station: SavedStation) => {
    updateStationCollection((current) => unsaveStation(current, station.id));
    queueStationUndo(station, "saved", "Station unsaved.");
  };
  const removeStationRow = (station: SavedStation, membership: StationMembership) => {
    updateStationCollection((current) => removeStation(current, station.id));
    queueStationUndo(station, membership, "Station removed.");
  };
  const undoStationAction = () => {
    if (!stationUndo) return;
    updateStationCollection((current) => restoreStation(current, stationUndo.station, stationUndo.membership));
    clearStationUndo();
  };
  const trains = useMemo(() => data?.trains.map((train) => ({ ...train, secondsToOrigin: now === null ? train.secondsToOrigin : secondsToOrigin(train.expectedArrival, new Date(now)) })) ?? [], [data, now]);
  useEffect(() => {
    const highlighted = data?.nextTrainId ? trains.find((train) => train.id === data.nextTrainId) : null;
    if (view !== "results" || !activeJourney || !highlighted || highlighted.secondsToOrigin >= -30) return;
    const key = `${activeJourney.from}:${activeJourney.to}:${data?.observedAt}`;
    if (expiredRefresh.current !== key) { expiredRefresh.current = key; void fetchJourney(); }
  }, [now, view, activeJourney, data?.observedAt, data?.nextTrainId, fetchJourney, trains]);
  const stale = Boolean(issue && data);
  const departureStale = Boolean(departuresIssue && departures);
  const ranks = (id: string) => {
    if (stale || !data) return undefined;
    const next = id === data.nextTrainId, fastest = id === data.fastestTrainId;
    if (next && fastest) return data.qualification === "best_arrival" ? "NEXT & BEST ARRIVAL" : data.qualification === "fastest_known" ? "NEXT & FASTEST KNOWN ARRIVAL" : "NEXT & FASTEST ARRIVAL";
    if (next) return "NEXT TRAIN";
    return fastest ? data.qualification === "best_arrival" ? "BEST ARRIVAL" : data.qualification === "fastest_known" ? "FASTEST KNOWN ARRIVAL" : "FASTEST ARRIVAL" : undefined;
  };
  const allowedDestinations = directDestinations(from);
  const validation = from && to && from.id === to.id ? "Choose two different stations." : from && to && !allowedDestinations.some((station) => station.id === to.id) ? "Choose a direct destination." : null;
  const installEligible = hydrated && (successes >= 2 || saved.length > 0);
  const handleFromChange = (next: Station | null) => { setFrom(next); if (to && next && !directDestinations(next).some((station) => station.id === to.id)) setTo(null); };
  const saveActive = () => { if (!activeJourney) return; const oldest = willReplaceOldest(activeJourney); if (oldest && !window.confirm(`Replace your oldest saved route, ${oldest.fromName} to ${oldest.toName}?`)) return; setSaved(saveJourney(activeJourney)); };
  const departureProblem = departuresIssue === "offline" ? "Live TfL data requires an internet connection." : departuresIssue === "upstream" ? "Live TfL data is temporarily unavailable. Try again shortly." : "We couldn’t read the latest live prediction.";

  return <main>
    <header><div><h1>Northern Direct</h1><p>Live Northern line departures and direct journeys.</p></div><nav aria-label="Views"><button className="text-button" aria-pressed={view === "departures"} onClick={showDepartures}>Departures</button><button className="text-button" aria-pressed={view === "journeys" || view === "search" || view === "results"} onClick={showJourneys}>Journeys</button>{activeJourney && <button className="text-button" onClick={() => navigateView("search")}>Change</button>}</nav></header>
    {view === "departures" && <section className="panel" aria-labelledby="departures-title">
      <div className="result-heading">
        <h2 id="departures-title">Departures</h2>
        <div className="result-actions">
          {boardStation && <ShareControl selection={{ type: "station", stationId: boardStation.id }} label={`Share ${boardStation.name} departures`} />}
          <button disabled={now !== null && now < departuresCooldown} onClick={() => void fetchDepartures(true)}>{now !== null && now < departuresCooldown ? "Refresh available soon" : "Refresh"}</button>
        </div>
      </div>
      {stationRows.length > 0 && <section className="station-history" aria-labelledby="station-history-title">
        <h3 id="station-history-title">Saved and recent stations</h3>
        <ul className="station-list" aria-label="Saved and recent stations">
          {stationRows.map((station) => {
            const membership: StationMembership = stationCollection.saved.some((item) => item.id === station.id) ? "saved" : "recent";
            const isSaved = membership === "saved";
            return <li className="station-row" key={station.id}>
              <button className="station-choice" type="button" onClick={() => selectBoardStation(byId.get(station.id) ?? null)}>{station.name}</button>
              <span className="station-membership">{isSaved ? "Saved" : "Recent"}</span>
              <div className="station-actions">
                <button className="text-button" type="button" aria-label={`${isSaved ? "Unsave" : "Save"} ${station.name}`} onClick={() => isSaved ? unsaveStationRow(station) : saveStationRow(station)}>{isSaved ? "Unsave" : "Save"}</button>
                <button className="text-button" type="button" aria-label={`Remove ${station.name}`} onClick={() => removeStationRow(station, membership)}>Remove</button>
              </div>
            </li>;
          })}
        </ul>
      </section>}
      <Combobox label="Station" value={boardStation} onChange={selectBoardStation} />
      {!boardStation && <p className="empty">Choose a station to see live Northern line departures.</p>}
      {boardStation && departuresLoading && !departures && <p role="status" className="status">Checking live Northern line departures…</p>}
      {boardStation && departuresIssue && <div role="alert" className="warning">{departureProblem}{departures && <><br /><strong>Last prediction — information may be stale.</strong></>} <button onClick={() => void fetchDepartures(true)}>Retry</button></div>}
      {departures && <section aria-busy={departuresLoading}><p className={departureStale ? "muted" : "updated"}>{departureStale ? "Last prediction — information may be stale." : `Updated ${now === null ? 0 : Math.max(0, Math.round((now - new Date(departures.observedAt).getTime()) / 1000))} sec ago`}</p><DepartureBoard data={departures} now={now ?? new Date(departures.observedAt).getTime()} stale={departureStale} /></section>}
    </section>}
    {view === "journeys" && <section className="saved-panel" aria-labelledby="saved-title"><h2 id="saved-title">Journeys</h2>{saved.length ? saved.map((item) => <div className="saved-row" key={`${item.from}-${item.to}`}><button onClick={() => activate(item)}>{item.fromName} → {item.toName}</button><button aria-label={`Remove ${item.fromName} to ${item.toName}`} onClick={() => { const index = saved.findIndex((entry) => entry.from === item.from && entry.to === item.to); setSaved(removeJourney(item)); setJourneyUndo({ journey: item, index }); }}>Remove</button></div>) : <p className="muted">No saved journeys yet.</p>}<button className="primary" onClick={() => navigateView("search")}>New journey</button></section>}
    {view === "search" && <section className="panel" aria-labelledby="search-title"><h2 id="search-title">Plan a journey</h2><form onSubmit={(event) => { event.preventDefault(); submit(); }}><Combobox label="From" value={from} onChange={handleFromChange} /><Combobox label="To" value={to} onChange={setTo} options={directDestinations(from)} disabled={!from} />{validation && <p className="validation" role="alert">{validation}</p>}<div className="form-actions"><button type="button" disabled={!from || !to} onClick={() => { const origin = from; setFrom(to); setTo(origin); }}>Swap</button><button className="primary" type="submit" disabled={!journey || Boolean(validation)}>Check trains</button></div></form></section>}
    {view === "results" && activeJourney && <section className="journey-bar" aria-label="Selected journey"><span>{activeJourney.fromName} → {activeJourney.toName}</span><div className="journey-actions"><ShareControl selection={{ type: "journey", from: activeJourney.from, to: activeJourney.to }} label={`Share ${activeJourney.fromName} to ${activeJourney.toName} journey`} /><button onClick={saveActive}>{saved.some((item) => item.from === activeJourney.from && item.to === activeJourney.to) ? "Saved" : "Save journey"}</button></div></section>}
    {view === "results" && loading && !data && <p role="status" className="status">Checking live Northern line trains…</p>}
    {view === "results" && issue && <div role="alert" className="warning">{issue === "offline" ? "Live TfL data requires an internet connection." : issue === "upstream" ? "Live TfL data is temporarily unavailable. Try again shortly." : "We couldn’t read the latest live prediction."}{data && <><br /><strong>Last prediction — information may be stale.</strong></>} <button onClick={() => void fetchJourney()}>Retry</button></div>}
    {view === "results" && data && <><p key={data.observedAt} role="status" aria-live="polite" className="visually-hidden">{trains.length} suitable {trains.length === 1 ? "train" : "trains"} observed.</p><section aria-busy={loading}><div className="result-heading"><h2>Next trains</h2><button disabled={now !== null && now < cooldownUntil} onClick={() => void fetchJourney(true)}>{now !== null && now < cooldownUntil ? "Refresh available soon" : "Refresh"}</button></div><p className={stale ? "muted" : "updated"}>Updated {now === null ? 0 : Math.max(0, Math.round((now - new Date(data.observedAt).getTime()) / 1000))} sec ago</p>{!trains.length ? <p className="empty">No suitable trains are currently predicted.</p> : trains.filter((train) => train.secondsToOrigin >= -30).map((train) => <TrainCard key={train.id} train={train} rank={ranks(train.id)} fresh={!stale} minutesSaved={data.fastestTrainId !== data.nextTrainId && data.fastestTrainId === train.id ? data.minutesSaved : null} />)}{data.withheldAmbiguousCount > 0 && <p className="muted">{data.withheldAmbiguousCount === 1 ? "1 ambiguous service was" : `${data.withheldAmbiguousCount} ambiguous services were`} withheld.</p>}</section></>}
    {journeyUndo && <div className="undo" role="status">Journey removed. <button onClick={() => { setSaved(restoreJourney(journeyUndo.journey, journeyUndo.index)); clearJourneyUndo(); }}>Undo</button></div>}
    {journeyUndo && <UndoExpiry clear={clearJourneyUndo} />}
    {stationUndo && <div className="undo" role="status" aria-label="Station actions">{stationUndo.message} <button onClick={undoStationAction}>Undo</button></div>}
    {stationUndo && <UndoExpiry key={stationUndo.id} clear={clearStationUndo} />}
    <InstallHint eligible={installEligible} />
    <footer>Unofficial app. Powered by TfL Open Data.</footer>
  </main>;
}

function UndoExpiry({ clear }: { clear: () => void }) { useEffect(() => { const timer = window.setTimeout(clear, 5_000); return () => window.clearTimeout(timer); }, [clear]); return null; }
