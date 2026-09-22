"use client";

/** Keeps opt-in browser geolocation, confirmation, and recovery UI browser-local. */

import { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { findNearestStations } from "@/lib/northern/nearest-station";
import { northernStationCoordinates } from "@/lib/northern/station-coordinates";
import { byId, type Station } from "@/lib/northern/stations";

/** Allows the owning view to revoke location intent without remounting the control. */
export type NearestStationControlHandle = Readonly<{ cancel: () => void }>;
type Props = Readonly<{ onStation: (station: Station) => void; ref?: Ref<NearestStationControlHandle> }>;
type Proposal = Readonly<{ station: Station; distanceMetres: number; reason: "accuracy" | "close" }>;

const POOR_ACCURACY_METRES = 250;
const CLOSE_STATION_DIFFERENCE_METRES = 150;

/** Identifies browser-supplied location evidence that is unsafe to rank. */
class InvalidBrowserLocationError extends Error {}

/** Rejects malformed browser coordinates and accuracy before station ranking. */
function validateBrowserLocation(coords: GeolocationCoordinates): void {
  const validCoordinates = Number.isFinite(coords.latitude)
    && coords.latitude >= -90
    && coords.latitude <= 90
    && Number.isFinite(coords.longitude)
    && coords.longitude >= -180
    && coords.longitude <= 180;
  const validAccuracy = Number.isFinite(coords.accuracy) && coords.accuracy >= 0;
  if (!validCoordinates || !validAccuracy) throw new InvalidBrowserLocationError();
}

const errorMessage = (error: GeolocationPositionError): string => {
  if (error.code === 1) return "Location permission was denied.";
  if (error.code === 2) return "Your location is currently unavailable.";
  if (error.code === 3) return "Location request timed out.";
  return "Your location is currently unavailable.";
};

/**
 * Requests location only after an explicit action and returns a canonical station.
 *
 * Parameters
 * ----------
 * onStation : (station: Station) => void
 *     Receives the accepted canonical station without raw browser coordinates.
 * ref : Ref<NearestStationControlHandle>, optional
 *     Cancels pending results and confirmation when the owner changes selection or navigates.
 *
 * Returns
 * -------
 * React.ReactNode
 *     An opt-in nearest-station control with accessible status and confirmation UI.
 */
export default function NearestStationControl({ onStation, ref }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const lookupSequence = useRef(0);
  const cancel = useCallback(() => {
    lookupSequence.current += 1;
    setMessage(null);
    setProposal(null);
  }, []);
  useImperativeHandle(ref, () => ({ cancel }), [cancel]);
  // getCurrentPosition has no abort API. Revoke callback ownership on cleanup.
  useLayoutEffect(() => () => { lookupSequence.current += 1; }, []);

  const selectNearest = () => {
    const requestId = ++lookupSequence.current;
    if (!navigator.geolocation) {
      setProposal(null);
      setMessage("Your browser does not support location. Choose a station manually.");
      return;
    }
    setMessage("Finding the nearest Northern station…");
    setProposal(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== lookupSequence.current) return;
        lookupSequence.current += 1;
        try {
          validateBrowserLocation(position.coords);
          const ranked = findNearestStations(position.coords, northernStationCoordinates);
          const station = byId.get(ranked.nearest.id);
          if (!station) {
            setMessage("Nearest station is unavailable. Choose a station manually.");
            return;
          }
          const closeResult = ranked.secondNearestDistanceMetres !== null
            && ranked.secondNearestDistanceMetres - ranked.nearestDistanceMetres <= CLOSE_STATION_DIFFERENCE_METRES;
          if (position.coords.accuracy > POOR_ACCURACY_METRES || closeResult) {
            setProposal({ station, distanceMetres: ranked.nearestDistanceMetres, reason: position.coords.accuracy > POOR_ACCURACY_METRES ? "accuracy" : "close" });
            setMessage(null);
            return;
          }
          setMessage(null);
          onStation(station);
        } catch (error) {
          if (!(error instanceof InvalidBrowserLocationError)) throw error;
          setProposal(null);
          setMessage("We couldn’t use that location. Choose a station manually.");
        }
      },
      (error) => {
        if (requestId !== lookupSequence.current) return;
        lookupSequence.current += 1;
        setProposal(null);
        setMessage(`${errorMessage(error)} Choose a station manually.`);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
    );
  };

  const confirmProposal = () => {
    if (!proposal) return;
    setProposal(null);
    setMessage(null);
    onStation(proposal.station);
  };

  const distance = proposal ? `${Math.max(1, Math.round(proposal.distanceMetres))} metres away` : null;

  return <div className="nearest-station-control">
    <button type="button" onClick={selectNearest}>Use nearest station</button>
    {message && <p className="status" role={message.includes("Choose a station manually") ? "alert" : "status"}>{message}</p>}
    {proposal && <div className="nearest-station-proposal" role="status">
      <p>{proposal.reason === "accuracy" ? "Location accuracy is low. " : "The nearest result is close to another station. "}Nearest station: <strong>{proposal.station.name}</strong>, about {distance}.</p>
      <div className="form-actions"><button type="button" onClick={cancel}>Choose manually</button><button className="primary" type="button" onClick={confirmProposal}>Use {proposal.station.name}</button></div>
    </div>}
  </div>;
}
