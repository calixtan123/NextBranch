/** Verified rail feed coverage and explicit mode-specific platform labels. */
import { undergroundLines, undergroundPlatformInfo, type CardinalDirection } from "../underground/platform";

export const railLines = [...undergroundLines, "dlr"] as const;

/**
 * Reads an explicit platform label using the reviewed feed's format.
 *
 * Parameters
 * ----------
 * lineId : string
 *     Exact TfL service line. Other modes remain unverified.
 * label : string, optional
 *     Official live label. DLR publishes numbers without cardinal direction.
 *
 * Returns
 * -------
 * object
 *     Explicit platform and direction, with confirmation of the label format.
 *     DLR letter suffixes use the station archive's uppercase spelling.
 */
export function railPlatformInfo(lineId: string, label?: string): { direction: CardinalDirection | null; platform: string | null; confirmed: boolean } {
  if (undergroundLines.some(line => line === lineId)) return undergroundPlatformInfo(label);
  if (lineId === "dlr") {
    const match = /^(?:Platform\s+)?([0-9]+[A-Za-z]?)$/i.exec(label?.trim() ?? "");
    if (match) return { direction: null, platform: match[1]!.toUpperCase(), confirmed: true };
  }
  return { direction: null, platform: null, confirmed: false };
}
