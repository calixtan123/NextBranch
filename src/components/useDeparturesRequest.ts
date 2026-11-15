"use client";

import { useCallback, useEffect } from "react";
import { parseDeparturesResponse, type DeparturesResponse } from "@/lib/departure-view";
import { anchorResponse, suspendResponse } from "@/lib/northern/response-time";
import { useLiveRequest } from "./useLiveRequest";

/** Fetches one station board while its departure view is active. */
export function useDeparturesRequest(station: string | null, active = true) {
  const key = station ?? "";
  const url = useCallback(() => `/api/departures?station=${encodeURIComponent(key)}`, [key]);
  const parse = useCallback((value: unknown, startedAt: number): DeparturesResponse | null => {
    const parsed = parseDeparturesResponse(value, station ?? undefined);
    const receivedAt = performance.now();
    return parsed ? anchorResponse(parsed, receivedAt, Math.max(0, receivedAt - startedAt)) : null;
  }, [station]);
  const request = useLiveRequest({ key, active: active && Boolean(station), url, parse, suspendOnHidden: true });
  const { setData } = request;
  useEffect(() => {
    const suspend = () => setData(current => current ? suspendResponse(current) : current);
    // Invalidate on both edges: a response may have completed while hidden.
    document.addEventListener("visibilitychange", suspend);
    if (!active) suspend();
    return () => document.removeEventListener("visibilitychange", suspend);
  }, [active, setData]);
  return { ...request, fetchDepartures: request.fetchLive };
}
