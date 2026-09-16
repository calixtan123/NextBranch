"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Combobox from "./Combobox";
import TrainCard from "./TrainCard";
import { useJourneyRequest } from "./useJourneyRequest";
import { directDestinations } from "@/lib/northern/direct-destinations";
import { byId, type Station } from "@/lib/northern/stations";
import { secondsToOrigin } from "@/lib/northern/time";
import type { Journey } from "@/lib/journeys/types";
import { readJourneys, removeJourney, restoreJourney, saveJourney, willReplaceOldest } from "@/lib/storage/journeys";

const fromUrl = (value: string | null) => value ? byId.get(value) ?? null : null;
type InstallEvent = Event & { prompt: () => Promise<void> };
type View = "search" | "journeys" | "results";
export default function Home() {
  const params = useSearchParams(); const router = useRouter();
  const [from, setFrom] = useState<Station | null>(() => fromUrl(params.get("from")));
  const [to, setTo] = useState<Station | null>(() => fromUrl(params.get("to")));
  // Keep the server render and first browser render identical; storage is read after hydration.
  const [saved, setSaved] = useState<Journey[]>([]);
  const [view, setView] = useState<View>("search");
  const [hydrated, setHydrated] = useState(false);
  const [activated, setActivated] = useState<{ from: string; to: string } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ journey: Journey; index: number } | null>(null);
  const [successes, setSuccesses] = useState(0); const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null); const [installDismissed, setInstallDismissed] = useState(false);
  const explicitPending = useRef(false);
  const viewTouched = useRef(false);
  const journey = useMemo(() => from && to ? { from: from.id, to: to.id, fromName: from.name, toName: to.name } : null, [from, to]);
  const activeJourney = useMemo(() => activated && journey && activated.from === journey.from && activated.to === journey.to ? journey : null, [activated, journey]);
  // The hook retains keyed data while inactive, but must not poll or listen
  // while the user is browsing saved journeys or changing a route.
  const request = useJourneyRequest(view === "results" ? activeJourney : null);
  const { data, loading, issue, fetchJourney, cooldownUntil } = request;
  const expiredRefresh = useRef("");
  const clearUndo = useCallback(() => setUndo(null), []);
  useEffect(() => { const timer = window.setTimeout(() => { const journeys = readJourneys(); let dismissed = false; try { dismissed = window.sessionStorage.getItem("northern-direct:install-dismissed") === "1"; } catch { /* unavailable storage should not block the app */ } setSaved(journeys); if (!viewTouched.current) setView(journeys.length === 0 ? "search" : "journeys"); setInstallDismissed(dismissed); setHydrated(true); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    if (!data || issue || !explicitPending.current) return;
    explicitPending.current = false;
    const timer = window.setTimeout(() => setSuccesses((count) => count + 1), 0);
    return () => window.clearTimeout(timer);
  }, [data, issue]);
  useEffect(() => {
    const accept = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    window.addEventListener("beforeinstallprompt", accept); return () => window.removeEventListener("beforeinstallprompt", accept);
  }, []);
  const navigateView = (next: View) => { viewTouched.current = true; setView(next); };
  const activate = (next: Journey) => { explicitPending.current = true; setFrom(byId.get(next.from) ?? null); setTo(byId.get(next.to) ?? null); setActivated({ from: next.from, to: next.to }); navigateView("results"); router.push(`/?from=${next.from}&to=${next.to}`); };
  useEffect(() => { if (view === "results" && activeJourney) void fetchJourney(); }, [view, activeJourney, fetchJourney]);
  const submit = () => {
    if (!journey || validation) return;
    explicitPending.current = true;
    setActivated({ from: journey.from, to: journey.to }); navigateView("results"); router.push(`/?from=${journey.from}&to=${journey.to}`);
  };
  const trains = useMemo(() => data?.trains.map((train) => ({ ...train, secondsToOrigin: now === null ? train.secondsToOrigin : secondsToOrigin(train.expectedArrival, new Date(now)) })) ?? [], [data, now]);
  useEffect(() => {
    const highlighted = data?.nextTrainId ? trains.find((train) => train.id === data.nextTrainId) : null;
    if (view !== "results" || !activeJourney || !highlighted || highlighted.secondsToOrigin >= -30) return;
    const key = `${activeJourney.from}:${activeJourney.to}:${data?.observedAt}`;
    if (expiredRefresh.current !== key) { expiredRefresh.current = key; void fetchJourney(); }
  }, [now, view, activeJourney, data?.observedAt, data?.nextTrainId, fetchJourney, trains]);
  const stale = Boolean(issue && data);
  const ranks = (id: string) => {
    if (stale || !data) return undefined;
    const next = id === data.nextTrainId, fastest = id === data.fastestTrainId;
    const qualification = data.qualification;
    if (next && fastest) return qualification === "best_arrival" ? "NEXT & BEST ARRIVAL" : qualification === "fastest_known" ? "NEXT & FASTEST KNOWN ARRIVAL" : "NEXT & FASTEST ARRIVAL";
    if (next) return "NEXT TRAIN";
    return fastest ? qualification === "best_arrival" ? "BEST ARRIVAL" : qualification === "fastest_known" ? "FASTEST KNOWN ARRIVAL" : "FASTEST ARRIVAL" : undefined;
  };
  const allowedDestinations = directDestinations(from);
  const validation = from && to && from.id === to.id ? "Choose two different stations." : from && to && !allowedDestinations.some((station) => station.id === to.id) ? "Choose a direct destination." : null;
  const installEligible = hydrated && !installDismissed && (successes >= 2 || saved.length > 0) && !window.matchMedia?.("(display-mode: standalone)").matches;
  const handleFromChange = (next: Station | null) => { setFrom(next); if (to && next && !directDestinations(next).some((station) => station.id === to.id)) setTo(null); };
  const saveActive = () => { if (!activeJourney) return; const oldest = willReplaceOldest(activeJourney); if (oldest && !window.confirm(`Replace your oldest saved route, ${oldest.fromName} to ${oldest.toName}?`)) return; setSaved(saveJourney(activeJourney)); };
  const showJourneys = () => navigateView("journeys");
  const showSearch = () => navigateView("search");
  return <main>
    <header><div><h1>Northern Direct</h1><p>See only Northern line trains that serve your destination.</p></div>{activeJourney && <nav aria-label="Journey views"><button className="text-button" onClick={showJourneys} aria-pressed={view === "journeys"}>Journeys</button><button className="text-button" onClick={showSearch} aria-pressed={view === "search"}>Change</button></nav>}</header>
    {view === "journeys" && <section className="saved-panel" aria-labelledby="saved-title"><h2 id="saved-title">Journeys</h2>{saved.length ? saved.map((item) => <div className="saved-row" key={`${item.from}-${item.to}`}><button onClick={() => activate(item)}>{item.fromName} → {item.toName}</button><button aria-label={`Remove ${item.fromName} to ${item.toName}`} onClick={() => { const index = saved.findIndex((entry) => entry.from === item.from && entry.to === item.to); setSaved(removeJourney(item)); setUndo({ journey: item, index }); }}>Remove</button></div>) : <p className="muted">No saved journeys yet.</p>}<button className="primary" onClick={showSearch}>New journey</button></section>}
    {view === "search" && <section className="panel" aria-labelledby="search-title"><h2 id="search-title">Plan a journey</h2><form onSubmit={(event) => { event.preventDefault(); submit(); }}><Combobox label="From" value={from} onChange={handleFromChange} /><Combobox label="To" value={to} onChange={setTo} options={directDestinations(from)} disabled={!from} />{validation && <p className="validation" role="alert">{validation}</p>}<div className="form-actions"><button type="button" onClick={() => { const origin = from; setFrom(to); setTo(origin); }}>Swap</button><button className="primary" type="submit" disabled={!journey || Boolean(validation)}>Check trains</button></div></form></section>}
    {view === "results" && activeJourney && <section className="journey-bar" aria-label="Selected journey"><span>{activeJourney.fromName} → {activeJourney.toName}</span><button onClick={saveActive}> {saved.some((item) => item.from === activeJourney.from && item.to === activeJourney.to) ? "Saved" : "Save journey"}</button></section>}
    {view === "results" && loading && !data && <p role="status" className="status">Checking live Northern line trains…</p>}
    {view === "results" && issue && <div role="alert" className="warning">{issue === "offline" ? "Live TfL data requires an internet connection." : issue === "upstream" ? "Live TfL data is temporarily unavailable. Try again shortly." : "We couldn’t read the latest live prediction."}{data && <><br /><strong>Last prediction — information may be stale.</strong></>} <button onClick={() => void fetchJourney()}>Retry</button></div>}
    {view === "results" && data && <><p key={data.observedAt} role="status" aria-live="polite" className="visually-hidden">{trains.length} suitable {trains.length === 1 ? "train" : "trains"} observed.</p><section aria-busy={loading}><div className="result-heading"><h2>Next trains</h2><button disabled={now !== null && now < cooldownUntil} onClick={() => void fetchJourney(true)}>{now !== null && now < cooldownUntil ? "Refresh available soon" : "Refresh"}</button></div><p className={stale ? "muted" : "updated"}>Updated {now === null ? 0 : Math.max(0, Math.round((now - new Date(data.observedAt).getTime()) / 1000))} sec ago</p>{!trains.length ? <p className="empty">No suitable trains are currently predicted.</p> : trains.filter((train) => train.secondsToOrigin >= -30).map((train) => <TrainCard key={train.id} train={train} rank={ranks(train.id)} fresh={!stale} minutesSaved={data.fastestTrainId !== data.nextTrainId && data.fastestTrainId === train.id ? data.minutesSaved : null} />)}{data.withheldAmbiguousCount > 0 && <p className="muted">{data.withheldAmbiguousCount === 1 ? "1 ambiguous service was" : `${data.withheldAmbiguousCount} ambiguous services were`} withheld.</p>}</section></>}
    {undo && <div className="undo" role="status">Journey removed. <button onClick={() => { setSaved(restoreJourney(undo.journey, undo.index)); setUndo(null); }}>Undo</button></div>}
    {undo && <UndoExpiry clear={clearUndo} />}
    {installEligible && <aside className="install-hint">Add Northern Direct to your home screen for quicker access. {installEvent && <button onClick={() => void installEvent.prompt()}>Install</button>}<button onClick={() => { setInstallDismissed(true); try { window.sessionStorage.setItem("northern-direct:install-dismissed", "1"); } catch { /* session persistence is best effort */ } }}>Dismiss</button></aside>}
    <footer>Unofficial app. Powered by TfL Open Data.</footer>
  </main>;
}
function UndoExpiry({ clear }: { clear: () => void }) { useEffect(() => { const timer = window.setTimeout(clear, 5_000); return () => window.clearTimeout(timer); }, [clear]); return null; }
