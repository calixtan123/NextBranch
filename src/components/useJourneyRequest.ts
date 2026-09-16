"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseJourneyResponse, type JourneyResponse } from "@/lib/journey-view";

export type RequestIssue = "offline" | "upstream" | "invalid" | null;
type Journey = { from: string; to: string };
type InFlight = { key: string; controller: AbortController; promise: Promise<void> };
const keyFor = (journey: Journey | null) => journey ? `${journey.from}:${journey.to}` : "";
export function useJourneyRequest(journey: { from: string; to: string } | null) {
  const [data, setData] = useState<JourneyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<RequestIssue>(null);
  const inFlight = useRef<InFlight | null>(null);
  const [dataKey, setDataKey] = useState("");
  const [issueKey, setIssueKey] = useState("");
  const [loadingKey, setLoadingKey] = useState("");
  const cooldown = useRef(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const key = keyFor(journey);
  const fetchJourney = useCallback(async (manual = false) => {
    if (!journey) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) { setIssueKey(key); setIssue("offline"); return; }
    if (manual && Date.now() < cooldown.current) return;
    const existing = inFlight.current;
    if (existing?.key === key) return existing.promise;
    if (manual) { cooldown.current = Date.now() + 10_000; setCooldownUntil(cooldown.current); }
    existing?.controller.abort();
    const controller = new AbortController();
    setLoadingKey(key); setLoading(true);
    const run = (async () => {
      try {
        const response = await fetch(`/api/journey?from=${encodeURIComponent(journey.from)}&to=${encodeURIComponent(journey.to)}`, { cache: "no-store", signal: controller.signal });
        let parsed: JourneyResponse | null = null;
        if (response.ok) {
          let body: unknown;
          try {
            body = await response.json();
          } catch {
            throw new Error("invalid");
          }
          parsed = parseJourneyResponse(body, journey);
        }
        if (!parsed) throw new Error(response.status >= 500 ? "upstream" : "invalid");
        if (!controller.signal.aborted) { setDataKey(key); setIssueKey(""); setData(parsed); setIssue(null); }
      } catch (error) {
        if (!controller.signal.aborted) { setIssueKey(key); setIssue(error instanceof Error && error.message === "invalid" ? "invalid" : "upstream"); }
      } finally {
        if (inFlight.current?.controller === controller) {
          inFlight.current = null;
          if (!controller.signal.aborted) { setLoadingKey(""); setLoading(false); }
        }
      }
    })();
    inFlight.current = { key, controller, promise: run };
    return run;
  }, [journey, key]);
  useEffect(() => {
    inFlight.current?.controller.abort();
    inFlight.current = null;
    // Returned data and errors are keyed below, so a route switch hides the old
    // response during this render without a state update from an effect.
  }, [key]);
  useEffect(() => () => inFlight.current?.controller.abort(), []);
  useEffect(() => {
    if (!journey) return;
    const offline = () => { inFlight.current?.controller.abort(); inFlight.current = null; setLoadingKey(""); setIssueKey(key); setLoading(false); setIssue("offline"); };
    const resume = () => { if (document.visibilityState === "visible" && navigator.onLine) void fetchJourney(); };
    const interval = window.setInterval(resume, 30_000);
    document.addEventListener("visibilitychange", resume); window.addEventListener("online", resume); window.addEventListener("offline", offline);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); window.removeEventListener("offline", offline); };
  }, [journey, fetchJourney, key]);
  return { data: dataKey === key ? data : null, setData, loading: loading && loadingKey === key, issue: issueKey === key ? issue : null, fetchJourney, cooldownUntil };
}
