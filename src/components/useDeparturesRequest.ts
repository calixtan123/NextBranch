"use client";

import { useCallback } from "react";
import { parseDeparturesResponse, type DeparturesResponse } from "@/lib/departure-view";
import { useLiveRequest } from "./useLiveRequest";

/** Fetches one station board while its departure view is active. */
export function useDeparturesRequest(station: string | null, active = true) {
  const key = station ?? "";
  const url = useCallback(() => `/api/departures?station=${encodeURIComponent(key)}`, [key]);
  const parse = useCallback((value: unknown): DeparturesResponse | null => parseDeparturesResponse(value, station ?? undefined), [station]);
  const request = useLiveRequest({ key, active: active && Boolean(station), url, parse });
  return { ...request, fetchDepartures: request.fetchLive };
}
