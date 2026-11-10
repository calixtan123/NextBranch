/** Explicit Underground platform labels and feed coverage, usable offline in native. */
export const undergroundLines = ["bakerloo", "central", "circle", "district", "hammersmith-city", "jubilee", "metropolitan", "northern", "piccadilly", "victoria", "waterloo-city"] as const;
export type UndergroundLine = typeof undergroundLines[number];
export type CardinalDirection = "Northbound" | "Southbound" | "Eastbound" | "Westbound";

/**
 * Reads an explicit Underground cardinal/number label without using destinations.
 *
 * Parameters
 * ----------
 * label : string, optional
 *     Official feed platform label, with observed whitespace/case variants.
 *
 * Returns
 * -------
 * object
 *     Confirmed explicit cardinal direction and single number, or unknown values.
 */
export function undergroundPlatformInfo(label?: string): { direction: CardinalDirection | null; platform: string | null; confirmed: boolean } {
  const match = /^(Northbound|Southbound|Eastbound|Westbound)(?: (?:Fast|Main))?\s*(?:-\s*)?Platform\s+([A-Za-z0-9]+)$/i.exec(label?.trim() ?? "");
  if (!match) return { direction: null, platform: null, confirmed: false };
  const direction = (match[1]![0]!.toUpperCase() + match[1]!.slice(1).toLowerCase()) as CardinalDirection;
  return { direction, platform: match[2]!, confirmed: true };
}
