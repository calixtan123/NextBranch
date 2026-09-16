import type { Train } from "./predictions";
export type Ranking =
  "best_arrival" | "fastest_arrival" | "fastest_known" | null;
export type Ranked = {
  trains: Train[];
  nextTrainId: string | null;
  fastestTrainId: string | null;
  qualification: Ranking;
  ranking: Ranking;
  minutesSaved: number | null;
  next: Train | null;
  fastest: Train | null;
};
const eta = (train: Train): number => train.destinationSeconds ?? Infinity;
const power = (train: Train): number =>
  train.evidence === "live" ? 2 : train.evidence === "estimate" ? 1 : 0;
/** Ranks origin order independently from destination ETA evidence. */
export function rankTrains(input: readonly Train[]): Ranked {
  const trains = [...input].toSorted(
    (a, b) => a.secondsToOrigin - b.secondsToOrigin || a.id.localeCompare(b.id),
  );
  const next = trains[0] ?? null;
  const known = trains.filter(
    (train): train is Train & { destinationSeconds: number } =>
      train.destinationSeconds !== null,
  );
  const fastest =
    known.toSorted(
      (a, b) =>
        eta(a) - eta(b) ||
        power(b) - power(a) ||
        a.secondsToOrigin - b.secondsToOrigin ||
        a.id.localeCompare(b.id),
    )[0] ?? null;
  const allKnown = trains.length > 0 && known.length === trains.length;
  const qualification = !allKnown
    ? known.length
      ? "fastest_known"
      : null
    : next && fastest && power(fastest) >= power(next)
      ? "best_arrival"
      : "fastest_arrival";
  const sameSources = next && fastest && next.evidence === fastest.evidence;
  return {
    trains,
    nextTrainId: next?.id ?? null,
    fastestTrainId: fastest?.id ?? null,
    qualification,
    ranking: qualification,
    minutesSaved:
      allKnown && sameSources && next && fastest
        ? Math.max(0, Math.round((eta(next) - eta(fastest)) / 60))
        : null,
    next,
    fastest,
  };
}
