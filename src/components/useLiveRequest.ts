/** Owns the lifecycle of uncached browser requests for both live views. */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RATE_LIMIT_RESPONSE, RATE_LIMIT_RETRY_AFTER_SECONDS } from "@/lib/rate-limit-contract";

export type RequestIssue = "offline" | "upstream" | "invalid" | "rate_limited" | null;
// Journey requests can use two sequential eight-second server stages; leave response overhead.
const LIVE_REQUEST_TIMEOUT_MS = 20_000;
type InFlight = { key: string; controller: AbortController; promise: Promise<void> };
type Options<T> = {
  key: string;
  active: boolean;
  url: () => string;
  parse: (value: unknown) => T | null;
};

/** Carries validated server retry guidance internally without exposing raw response data. */
class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("rate limited");
  }
}

function positiveRetrySeconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function retryAfterHeader(header: string | null): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header)) return positiveRetrySeconds(Number(header));
  const date = new Date(header);
  // Require the standard HTTP-date format rather than accepting Date.parse's loose inputs.
  if (date.toUTCString() !== header) return undefined;
  return positiveRetrySeconds(Math.ceil((date.getTime() - Date.now()) / 1_000));
}

/** Shares cancellation, polling, stale retention, and retry handling between live views. */
export function useLiveRequest<T>({ key, active, url, parse }: Options<T>) {
  const [data, setData] = useState<T | null>(null);
  const [dataKey, setDataKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingKey, setLoadingKey] = useState("");
  const [issue, setIssue] = useState<RequestIssue>(null);
  const [issueKey, setIssueKey] = useState("");
  const inFlight = useRef<InFlight | null>(null);
  const cooldown = useRef(0);
  const serverRetryUntil = useRef(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);
  const fetchLive = useCallback(async (manual = false) => {
    if (!active || !key) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIssueKey(key); setIssue("offline"); return;
    }
    if (Date.now() < serverRetryUntil.current) {
      const remainingSeconds = Math.max(1, Math.ceil((serverRetryUntil.current - Date.now()) / 1_000));
      setIssueKey(key); setIssue("rate_limited"); setRetryAfterSeconds(remainingSeconds);
      setCooldownUntil(Math.max(cooldown.current, serverRetryUntil.current));
      return;
    }
    const existing = inFlight.current;
    if (manual) {
      if (Date.now() < cooldown.current) return;
      cooldown.current = Date.now() + 10_000;
      setCooldownUntil(cooldown.current);
    }
    if (existing?.key === key) return existing.promise;
    existing?.controller.abort();
    const controller = new AbortController();
    let timedOut = false;
    let receivedRateLimit = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, LIVE_REQUEST_TIMEOUT_MS);
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = () => {
      window.clearTimeout(timer);
      rejectAbort(controller.signal.reason);
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });
    setLoadingKey(key); setLoading(true);
    const run = (async () => {
      try {
        // Racing the whole read also settles callers when a transport ignores abort.
        const parsed = await Promise.race([(async () => {
          const result = await fetch(url(), { cache: "no-store", signal: controller.signal });
          let value: T | null = null;
          if (result.status === 429) {
            receivedRateLimit = true;
            const retryAfter = retryAfterHeader(result.headers.get("Retry-After"));
            if (retryAfter !== undefined) throw new RateLimitError(retryAfter);
            const body = await result.json().catch(() => null);
            const bodyDelay = body?.error === RATE_LIMIT_RESPONSE.error
              ? positiveRetrySeconds(body.retryAfterSeconds)
              : undefined;
            throw new RateLimitError(bodyDelay ?? RATE_LIMIT_RETRY_AFTER_SECONDS);
          }
          if (result.ok) {
            try { value = parse(await result.json()); } catch { throw new Error("invalid"); }
          }
          if (!value) throw new Error(result.status >= 500 ? "upstream" : "invalid");
          return value;
        })(), aborted]);
        if (!controller.signal.aborted) {
          setDataKey(key); setData(parsed); setIssueKey(""); setIssue(null); setRetryAfterSeconds(null);
        }
      } catch (error) {
        if (inFlight.current?.controller === controller && (!controller.signal.aborted || timedOut)) {
          setIssueKey(key);
          if (error instanceof RateLimitError || (timedOut && receivedRateLimit)) {
            const retryAfter = error instanceof RateLimitError ? error.retryAfterSeconds : RATE_LIMIT_RETRY_AFTER_SECONDS;
            const retryUntil = Date.now() + retryAfter * 1_000;
            serverRetryUntil.current = Math.max(serverRetryUntil.current, retryUntil);
            setCooldownUntil(Math.max(cooldown.current, serverRetryUntil.current));
            setRetryAfterSeconds(retryAfter);
            setIssue("rate_limited");
          } else {
            setRetryAfterSeconds(null);
            setIssue(!timedOut && error instanceof Error && error.message === "invalid" ? "invalid" : "upstream");
          }
        }
      } finally {
        window.clearTimeout(timer);
        controller.signal.removeEventListener("abort", onAbort);
        if (inFlight.current?.controller === controller) {
          inFlight.current = null;
          if (!controller.signal.aborted || timedOut) { setLoadingKey(""); setLoading(false); }
        }
      }
    })();
    inFlight.current = { key, controller, promise: run };
    return run;
  }, [active, key, parse, url]);
  useEffect(() => { inFlight.current?.controller.abort(); inFlight.current = null; }, [active, key]);
  useEffect(() => () => { inFlight.current?.controller.abort(); inFlight.current = null; }, []);
  useEffect(() => {
    if (!active || !key) return;
    const offline = () => {
      inFlight.current?.controller.abort(); inFlight.current = null;
      setLoadingKey(""); setLoading(false); setIssueKey(key); setIssue("offline");
    };
    const resume = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void fetchLive();
    };
    const interval = window.setInterval(resume, 30_000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume); window.addEventListener("offline", offline);
    return () => {
      window.clearInterval(interval); document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume); window.removeEventListener("offline", offline);
    };
  }, [active, fetchLive, key]);
  return {
    data: dataKey === key ? data : null,
    setData,
    loading: loading && loadingKey === key,
    issue: issueKey === key ? issue : null,
    fetchLive,
    cooldownUntil,
    retryAfterSeconds,
  };
}
