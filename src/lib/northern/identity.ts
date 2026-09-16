import { createHash } from "crypto";
type IdentityInput = {
  id?: string | number;
  naptanId?: string;
  origin?: string;
  vehicleId?: string;
  destinationNaptanId?: string;
  expectedArrival?: string;
  platformName?: string;
  towards?: string;
};
/** Stable identity favours a TfL prediction ID only after its basic shape is validated. */
export function identity(prediction: IdentityInput): string {
  const upstream = prediction.id;
  if (
    (typeof upstream === "string" && upstream.trim()) ||
    (typeof upstream === "number" && Number.isFinite(upstream))
  )
    return String(upstream);
  return createHash("sha256")
    .update(
      [
        prediction.naptanId ?? prediction.origin ?? "",
        prediction.vehicleId ?? "",
        prediction.destinationNaptanId ?? "",
        prediction.expectedArrival ?? "",
        prediction.platformName ?? "",
        prediction.towards ?? "",
      ].join("|"),
    )
    .digest("hex");
}
/** Removes repeated upstream IDs or identical reduced fallback identities. */
export function dedupe<T extends IdentityInput>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = identity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
