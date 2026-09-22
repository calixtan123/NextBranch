import type { JourneyTrain } from "@/lib/journey-view";
import { displayCountdown, londonTime } from "@/lib/northern/time";

function eta(train: JourneyTrain) {
  if (!train.destinationArrival || train.evidence === "unavailable") return "Destination ETA unavailable";
  return `${train.evidence === "estimate" ? "~" : ""}${londonTime(train.destinationArrival)} · ${train.evidence === "live" ? "Live" : "Estimated"}`;
}
export default function TrainCard({ train, rank, fresh, minutesSaved }: { train: JourneyTrain; rank?: string; fresh: boolean; minutesSaved?: number | null }) {
  const platform = train.platformConfirmed && train.platform ? `Platform ${train.platform}` : train.direction ? `${train.direction} · Platform unconfirmed` : "Platform unconfirmed";
  return <article className={`train-card${fresh ? "" : " stale"}`}>
    <div className="card-top">{fresh && rank ? <span className="rank">{rank}</span> : <span />}<strong>{train.destinationName || "Northern line"}</strong></div>
    <div className="countdown" aria-label={`${displayCountdown(train.secondsToOrigin)} at origin`}>{displayCountdown(train.secondsToOrigin)}</div>
    <dl className="details"><div><dt>Origin</dt><dd>{londonTime(train.expectedArrival)}</dd></div><div><dt>Platform</dt><dd className={train.platformConfirmed ? "platform-confirmed" : undefined}>{platform}</dd></div><div><dt>Destination</dt><dd aria-label={`Destination ETA: ${eta(train)}`}>{eta(train)}</dd></div></dl>
    {train.via && <p className="via">via {train.via}</p>}
    {train.routeConfidence === "inferred" && <p className="evidence">Route inferred from TfL service data</p>}
    {fresh && minutesSaved && minutesSaved > 0 && <p className="saved-minutes">Arrives {minutesSaved} min earlier</p>}
  </article>;
}
