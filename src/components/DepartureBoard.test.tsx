import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DepartureBoard from "./DepartureBoard";

describe("DepartureBoard", () => {
  it("renders compact platform sections, cleaned destinations, local time, and an unknown platform", () => {
    render(<DepartureBoard
      data={{
        station: { id: "940GZZLUCTN", name: "Camden Town" },
        observedAt: "2026-09-16T12:00:00.000Z",
        newestPredictionGeneratedAt: "2026-09-16T11:59:00.000Z",
        refreshAfterSeconds: 30,
        platforms: [
          { platform: "2", direction: "Northbound", departures: [{ id: "one", destinationName: "Edgware via Charing Cross", expectedArrival: "2026-09-16T12:01:00.000Z", secondsToStation: 60, towards: "Edgware via Charing Cross" }] },
          { platform: null, direction: null, departures: [{ id: "two", destinationName: null, expectedArrival: "2026-09-16T12:00:20.000Z", secondsToStation: 20, towards: null }] },
        ],
      }}
      now={new Date("2026-09-16T12:00:00.000Z").getTime()}
      stale={false}
    />);
    expect(screen.getByRole("heading", { name: "Platform 2 · Northbound" })).toBeInTheDocument();
    expect(screen.getByText("Edgware")).toBeInTheDocument();
    expect(screen.queryByText("Edgware via Charing Cross")).not.toBeInTheDocument();
    expect(screen.getAllByText("1 min")).toHaveLength(2);
    expect(screen.getByText("Unknown destination")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Platform unavailable" })).toBeInTheDocument();
  });

  it("uses Due during the grace period and removes departed rows after it", () => {
    const data = {
      station: { id: "940GZZLUCTN", name: "Camden Town" }, observedAt: "2026-09-16T12:00:00.000Z",
      newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
      platforms: [{ platform: "1", direction: "Northbound" as const, departures: [{ id: "one", destinationName: "Edgware", expectedArrival: "2026-09-16T12:00:00.000Z", secondsToStation: 0, towards: null }]}],
    };
    const { rerender } = render(<DepartureBoard data={data} now={new Date("2026-09-16T12:00:10.000Z").getTime()} stale={false} />);
    expect(screen.getByText("Due")).toBeInTheDocument();
    rerender(<DepartureBoard data={data} now={new Date("2026-09-16T12:00:31.000Z").getTime()} stale={false} />);
    expect(screen.queryByText("Edgware")).not.toBeInTheDocument();
  });

  it("distinguishes unavailable platforms by their known direction", () => {
    render(<DepartureBoard
      data={{
        station: { id: "940GZZLUCTN", name: "Camden Town" }, observedAt: "2026-09-16T12:00:00.000Z",
        newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
        platforms: [
          { platform: null, direction: "Northbound", departures: [{ id: "north", destinationName: "Edgware", expectedArrival: "2026-09-16T12:02:00.000Z", secondsToStation: 120, towards: null }] },
          { platform: null, direction: "Southbound", departures: [{ id: "south", destinationName: "Morden", expectedArrival: "2026-09-16T12:03:00.000Z", secondsToStation: 180, towards: null }] },
        ],
      }}
      now={new Date("2026-09-16T12:00:00.000Z").getTime()}
      stale={false}
    />);
    expect(screen.getByRole("heading", { name: "Platform unavailable · Northbound" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Platform unavailable · Southbound" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Platform unavailable · Northbound departures" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Platform unavailable · Southbound departures" })).toBeInTheDocument();
  });
});
