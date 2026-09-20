"use client";

/** Provides canonical station and journey sharing through browser-native APIs. */

import { useState } from "react";

/** Identifies the currently active canonical view that may be shared. */
export type ShareSelection =
  | { type: "station"; stationId: string }
  | { type: "journey"; from: string; to: string };

type Props = {
  selection: ShareSelection;
  label: string;
};

/**
 * Builds a root URL containing only canonical parameters for an active selection.
 *
 * Parameters
 * ----------
 * origin : string
 *     The current browser origin.
 * selection : ShareSelection
 *     The active station or journey to include in the shared URL.
 *
 * Returns
 * -------
 * string
 *     An absolute, canonical URL without live results or browser-local state.
 */
export function buildShareUrl(origin: string, selection: ShareSelection): string {
  const parameters = new URLSearchParams(
    selection.type === "station"
      ? { station: selection.stationId }
      : { from: selection.from, to: selection.to },
  );
  return `${origin}/?${parameters.toString()}`;
}

/** Returns whether an unsuccessful native share was cancelled by the person using the device. */
function isShareCancellation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

/**
 * Shares one active station or journey through the native sheet or clipboard.
 *
 * Parameters
 * ----------
 * selection : ShareSelection
 *     The active canonical selection to share.
 * label : string
 *     The accessible name describing the current selection.
 *
 * Returns
 * -------
 * React.ReactNode
 *     A quiet share control with accessible outcome feedback.
 */
export default function ShareControl({ selection, label }: Props) {
  const [notice, setNotice] = useState<"Link copied" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    setNotice(null);
    setError(null);
    const url = buildShareUrl(window.location.origin, selection);

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url });
        return;
      } catch (shareError: unknown) {
        if (isShareCancellation(shareError)) return;
      }
    }

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setNotice("Link copied");
    } catch {
      setError("Unable to share link.");
    }
  };

  return <div className="share-control">
    <button className="text-button" type="button" aria-label={label} onClick={() => void share()}>Share</button>
    {notice && <p className="visually-hidden" role="status">{notice}</p>}
    {error && <p className="share-error" role="alert">{error}</p>}
  </div>;
}
