import { BANK, CX } from "./stations";
export type RouteStop = { id: string };
export type RouteSequence = {
  id?: string;
  name?: string;
  direction?: string;
  branch?: string | null;
  stations: readonly RouteStop[];
};
export type RouteResult = {
  servesDestination: true | false | null;
  confidence: "confirmed" | "inferred" | "unknown";
  servicePatternId: string | null;
};
export type Candidate = RouteResult & {
  route: RouteSequence;
  branch: string | null;
};
const termini = new Set([
  "940GZZLUHBT",
  "940GZZLUEGW",
  "940GZZLUMHL",
  "940GZZLUMDN",
  "940GZZBPSUST",
  "940GZZLUKNG",
]);
/** Only observed branch tokens constrain matching; other `towards` text is deliberately ignored. */
export function normalizeTowards(value: string | undefined): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (/\bvia\s+(?:cx|charing\s+cross)\b/.test(lower)) return CX;
  if (/\bvia\s+bank\b/.test(lower)) return BANK;
  return null;
}
/** Parses TfL's exact platform label. Direction-only data never implies a platform number. */
export function platformInfo(
  platformName?: string,
  direction?: string,
): {
  direction: "Northbound" | "Southbound" | null;
  platform: string | null;
  confirmed: boolean;
} {
  const exact =
    /^(Northbound|Southbound)\s*-\s*Platform\s+([A-Za-z0-9]+)$/.exec(
      platformName ?? "",
    );
  if (exact)
    return {
      direction: exact[1] as "Northbound" | "Southbound",
      platform: exact[2],
      confirmed: true,
    };
  if (direction === "inbound")
    return { direction: "Southbound", platform: null, confirmed: false };
  if (direction === "outbound")
    return { direction: "Northbound", platform: null, confirmed: false };
  return { direction: null, platform: null, confirmed: false };
}
/** Evaluates a pattern after a recognised advertised short-turn terminus has truncated it. */
export function candidateForRoute(
  route: RouteSequence,
  origin: string,
  destination: string,
  advertisedTerminus?: string,
): Candidate {
  const ids = route.stations.map((stop) => stop.id);
  const originAt = ids.indexOf(origin);
  if (originAt < 0)
    return {
      route,
      servesDestination: null,
      confidence: "unknown",
      servicePatternId: null,
      branch: route.branch ?? null,
    };
  let end = ids.length - 1;
  if (advertisedTerminus) {
    const terminusAt = ids.indexOf(advertisedTerminus);
    if (!termini.has(advertisedTerminus) || terminusAt < originAt)
      return {
        route,
        servesDestination: null,
        confidence: "unknown",
        servicePatternId: null,
        branch: route.branch ?? null,
      };
    end = terminusAt;
  }
  const destinationAt = ids.indexOf(destination);
  return {
    route,
    servesDestination: destinationAt >= originAt && destinationAt <= end,
    confidence: "confirmed",
    servicePatternId: route.id ?? null,
    branch: route.branch ?? null,
  };
}
/**
 * Applies the safety lattice to all route candidates.
 *
 * A false result is useful knowledge (the train is known not to serve the
 * destination); a disagreement or unknown result is deliberately withheld.
 */
export function selectSuitable(
  candidates: readonly Candidate[],
  _origin: string,
  _destination: string,
): {
  suitable: boolean;
  confidence: "confirmed" | "inferred" | "unknown";
  candidate: Candidate | null;
  withheld: boolean;
} {
  if (!candidates.length)
    return {
      suitable: false,
      confidence: "unknown",
      candidate: null,
      withheld: true,
    };
  const allFalse = candidates.every(
    (candidate) => candidate.servesDestination === false,
  );
  if (allFalse)
    return {
      suitable: false,
      confidence: "confirmed",
      candidate: candidates[0] ?? null,
      withheld: false,
    };
  if (candidates.some((candidate) => candidate.servesDestination !== true))
    return {
      suitable: false,
      confidence: "unknown",
      candidate: null,
      withheld: true,
    };
  const first = candidates[0] ?? null;
  const oneFullPattern =
    candidates.length === 1 && first?.servicePatternId !== null;
  const confidence = oneFullPattern ? "confirmed" : "inferred";
  const branches = new Set(candidates.map((candidate) => candidate.branch));
  const agreedBranch = branches.size === 1 ? first?.branch ?? null : null;
  return {
    suitable: true,
    confidence,
    candidate: first
      ? {
          ...first,
          confidence,
          branch: agreedBranch,
          servicePatternId:
            oneFullPattern ? first.servicePatternId : null,
        }
      : null,
    withheld: false,
  };
}
/** Builds ordered candidates from the topology's official full patterns. */
export function routeCandidates(
  routes: readonly { name?: string; naptanIds: readonly string[] }[],
  origin: string,
  destination: string,
  terminus?: string,
  towards?: string,
): Candidate[] {
  const branch = normalizeTowards(towards);
  return routes
    .map((route, index) => ({
      id: `pattern-${index}`,
      name: route.name,
      branch: route.naptanIds.includes(BANK)
        ? BANK
        : route.naptanIds.includes(CX)
          ? CX
          : null,
      stations: route.naptanIds.map((id) => ({ id })),
    }))
    .filter(
      (route) =>
        route.stations.some((stop) => stop.id === origin) &&
        (!terminus || !termini.has(terminus) ||
          (route.stations.some((stop) => stop.id === terminus) &&
            route.stations.findIndex((stop) => stop.id === terminus) >=
              route.stations.findIndex((stop) => stop.id === origin))) &&
        (!branch || route.branch === branch),
    )
    .map((route) => candidateForRoute(route, origin, destination, terminus));
}
/** A direct journey has at least one official ordered pattern with destination after origin. */
export function isDirectPair(
  routes: readonly { naptanIds: readonly string[] }[],
  origin: string,
  destination: string,
): boolean {
  return routes.some((route) => {
    const from = route.naptanIds.indexOf(origin);
    const to = route.naptanIds.indexOf(destination);
    return from >= 0 && to > from;
  });
}
export function routeBranch(towards?: string): string | null {
  return normalizeTowards(towards);
}
/** Presentation label for a stable central-branch station ID. */
export function branchLabel(branch: string | null): "Bank" | "Charing Cross" | null {
  return branch === BANK ? "Bank" : branch === CX ? "Charing Cross" : null;
}
