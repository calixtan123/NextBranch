/** Creates small, redacted diagnostics for server-side TfL request operations. */

type ErrorLike = { code?: unknown; upstreamStatus?: unknown };
const diagnosticOperations = ["arrivals", "topology", "timetable", "journey_topology", "unknown"] as const;
export type DiagnosticOperation = (typeof diagnosticOperations)[number];

export type Diagnostic = {
  operation: DiagnosticOperation;
  durationMs: number;
  errorCategory: "none" | "configuration" | "upstream" | "topology" | "timetable" | "unknown";
  upstreamStatus: number | null;
  topologyFallbackUsed: boolean;
};

type DiagnosticInput = {
  operation: unknown;
  durationMs: number;
  error?: unknown;
  topologyFallbackUsed?: boolean;
};

function normalizeOperation(operation: unknown): DiagnosticOperation {
  return typeof operation === "string" && diagnosticOperations.includes(operation as DiagnosticOperation)
    ? operation as DiagnosticOperation
    : "unknown";
}

function normalizeError(error: unknown): Pick<Diagnostic, "errorCategory" | "upstreamStatus"> {
  if (!error) return { errorCategory: "none", upstreamStatus: null };
  const value = error as ErrorLike;
  const category = value.code === "config"
    ? "configuration"
    : value.code === "upstream"
      ? "upstream"
      : value.code === "topology"
        ? "topology"
        : value.code === "timetable"
          ? "timetable"
          : "unknown";
  const status = value.upstreamStatus;
  return {
    errorCategory: category,
    upstreamStatus: typeof status === "number" && Number.isInteger(status) ? status : null,
  };
}

/**
 * Produces a safe diagnostic record from an operation result.
 *
 * Parameters
 * ----------
 * input : DiagnosticInput
 *     Operation timing and an optional error. Error messages and arbitrary error
 *     fields are intentionally excluded so URLs, credentials, locations, and
 *     payloads cannot reach logs.

 * Returns
 * -------
 * Diagnostic
 *     A fixed-shape, redacted record suitable for server logs.
 */
export function createDiagnostic(input: DiagnosticInput): Diagnostic {
  return {
    operation: normalizeOperation(input.operation),
    durationMs: Math.max(0, Math.trunc(input.durationMs)),
    ...normalizeError(input.error),
    topologyFallbackUsed: input.topologyFallbackUsed ?? false,
  };
}

/**
 * Emits a redacted server diagnostic.
 *
 * Parameters
 * ----------
 * input : DiagnosticInput
 *     Details that will be normalized before logging.
 */
export function recordServerDiagnostic(input: DiagnosticInput): void {
  console.info("tfl_diagnostic", createDiagnostic(input));
}
