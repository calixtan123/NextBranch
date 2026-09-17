import type { DeparturesResponse } from "@/lib/departure-view";
import { DEPARTED_GRACE, displayCountdown, londonTime, secondsToOrigin } from "@/lib/northern/time";

type Props = { data: DeparturesResponse; now: number; stale: boolean };
const cleanDestination = (value: string | null) => value?.replace(/\s+via\s+.+$/i, "") || "Unknown destination";

/** Renders a compact station board from already-validated, platform-grouped departures. */
export default function DepartureBoard({ data, now, stale }: Props) {
  const platforms = data.platforms.map((platform) => ({
    ...platform,
    departures: platform.departures.filter(
      (departure) => secondsToOrigin(departure.expectedArrival, new Date(now)) >= -DEPARTED_GRACE,
    ),
  })).filter((platform) => platform.departures.length > 0);
  if (!platforms.length) return <p className="empty">No current Northern line departures are predicted.</p>;
  return <div className={stale ? "departure-board stale" : "departure-board"}>
    {platforms.map((platform) => {
      const title = platform.platform
        ? `Platform ${platform.platform}${platform.direction ? ` · ${platform.direction}` : ""}`
        : `Platform unavailable${platform.direction ? ` · ${platform.direction}` : ""}`;
      return <section className="platform-section" key={`${platform.platform ?? "unknown"}-${platform.direction ?? "unknown"}`}>
        <h2>{title}</h2>
        <ul className="departure-list" aria-label={`${title} departures`}>
          {platform.departures.map((departure) => {
            const seconds = secondsToOrigin(departure.expectedArrival, new Date(now));
            return <li className="departure-row" key={departure.id}>
              <strong>{cleanDestination(departure.destinationName)}</strong>
              <span className="departure-countdown">{displayCountdown(seconds)}</span>
              <span className="departure-time">{londonTime(departure.expectedArrival)}</span>
              {departure.towards && <span className="departure-towards">Towards {departure.towards}</span>}
            </li>;
          })}
        </ul>
      </section>;
    })}
  </div>;
}
