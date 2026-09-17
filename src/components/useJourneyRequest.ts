"use client";

import { useCallback } from "react";
import { parseJourneyResponse, type JourneyResponse } from "@/lib/journey-view";
import { useLiveRequest, type RequestIssue } from "./useLiveRequest";

export type { RequestIssue };
type Journey = { from: string; to: string };

/** Fetches a selected journey while retaining keyed responses between live refreshes. */
export function useJourneyRequest(journey: Journey | null) {
  const key = journey ? `${journey.from}:${journey.to}` : "";
  const url = useCallback(
    () => `/api/journey?from=${encodeURIComponent(journey?.from ?? "")}&to=${encodeURIComponent(journey?.to ?? "")}`,
    [journey],
  );
  const parse = useCallback(
    (value: unknown): JourneyResponse | null => parseJourneyResponse(value, journey ?? undefined),
    [journey],
  );
  const request = useLiveRequest({ key, active: Boolean(journey), url, parse });
  return { ...request, fetchJourney: request.fetchLive };
}
