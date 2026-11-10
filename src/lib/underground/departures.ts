/** Compatibility exports for existing Underground departure consumers. */
export { normalizeRailPredictions as normalizeUndergroundPredictions } from "../rail/departures";
export type { RailDeparture as UndergroundDeparture } from "../rail/departures";
export { undergroundPlatformInfo } from "./platform";
