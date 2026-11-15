import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DeparturesResponse } from "@/lib/departure-view";
import DepartureBoard from "./DepartureBoard";

describe("DepartureBoard", () => {
  it("identifies every train by its catalogue line name on a multi-line board", () => {
    render(<DepartureBoard
      data={{
        station: { id: "940GZZLUKSX", name: "King's Cross St Pancras" },
        observedAt: "2026-09-16T12:00:00.000Z", newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
        platforms: [{ platform: null, direction: "Southbound", departures: [
          { id: "northern:one", lineId: "northern", destinationName: "Morden", expectedArrival: "2026-09-16T12:01:00.000Z", secondsToStation: 60, towards: "Morden" },
          { id: "victoria:two", lineId: "victoria", destinationName: "Brixton", expectedArrival: "2026-09-16T12:02:00.000Z", secondsToStation: 120, towards: null },
          { id: "hammersmith-city:three", lineId: "hammersmith-city", destinationName: "Barking", expectedArrival: "2026-09-16T12:03:00.000Z", secondsToStation: 180, towards: null },
          { id: "future:four", lineId: "future-line", destinationName: "Unknown destination", expectedArrival: "2026-09-16T12:04:00.000Z", secondsToStation: 240, towards: null },
        ] }],
      }}
      now={new Date("2026-09-16T12:00:00.000Z").getTime()}
      stale={false}
    />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("Northern · Towards Morden")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Victoria")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Hammersmith & City")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("future-line")).toBeInTheDocument();
  });

  it("keeps physical platform sections stable when duplicate number and direction groups reorder", () => {
    const data: DeparturesResponse = {
      station: { id: "interchange", name: "Interchange" },
      observedAt: "2026-09-16T12:00:00.000Z", newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
      platforms: [
        { physicalPlatformId: "physical-northern", platform: "1", direction: "Southbound", departures: [{ id: "northern:one", lineId: "northern", destinationName: "Morden", expectedArrival: "2026-09-16T12:01:00.000Z", secondsToStation: 60, towards: null }] },
        { physicalPlatformId: "physical-victoria", platform: "1", direction: "Southbound", departures: [{ id: "victoria:two", lineId: "victoria", destinationName: "Brixton", expectedArrival: "2026-09-16T12:02:00.000Z", secondsToStation: 120, towards: null }] },
      ],
    };
    const now = new Date("2026-09-16T12:00:00.000Z").getTime();
    const { rerender } = render(<DepartureBoard data={data} now={now} stale={false} />);
    const northernSection = screen.getByText("Morden").closest("section");
    const victoriaSection = screen.getByText("Brixton").closest("section");
    expect(northernSection).not.toBe(victoriaSection);

    rerender(<DepartureBoard data={{ ...data, platforms: [...data.platforms].reverse() }} now={now} stale={false} />);
    expect(screen.getByText("Morden").closest("section")).toBe(northernSection);
    expect(screen.getByText("Brixton").closest("section")).toBe(victoriaSection);

    rerender(<DepartureBoard data={{ ...data, platforms: [data.platforms[1]!] }} now={now} stale={false} />);
    expect(screen.queryByText("Morden")).not.toBeInTheDocument();
    expect(screen.getByText("Brixton").closest("section")).toBe(victoriaSection);
  });

  it("describes an empty station board as TfL coverage", () => {
    render(<DepartureBoard
      data={{ station: { id: "940GZZLUEUS", name: "Euston" }, observedAt: "2026-09-16T12:00:00.000Z", newestPredictionGeneratedAt: null, refreshAfterSeconds: 30, platforms: [] }}
      now={new Date("2026-09-16T12:00:00.000Z").getTime()}
      stale={false}
    />);
    expect(screen.getByText("No current TfL departures are predicted.")).toBeInTheDocument();
  });

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
    expect(screen.getByText("1 min")).toBeInTheDocument();
    expect(screen.getByText("Due")).toBeInTheDocument();
    expect(screen.getByText("Unknown destination")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Platform unavailable" })).toBeInTheDocument();
  });

  it("uses Due during the grace period and removes departed rows after it", () => {
    const data = {
      station: { id: "940GZZLUCTN", name: "Camden Town" }, observedAt: "2026-09-16T12:00:00.000Z",
      newestPredictionGeneratedAt: null, refreshAfterSeconds: 30,
      platforms: [{ platform: "1", direction: "Northbound" as const, departures: [{ id: "one", destinationName: "Edgware", expectedArrival: "2026-09-16T12:00:00.000Z", secondsToStation: 0, towards: null }]}],
    };
    const { rerender } = render(<DepartureBoard data={data} now={new Date("2026-09-16T12:00:30.000Z").getTime()} stale={false} />);
    expect(screen.getByText("Due")).toBeInTheDocument();
    rerender(<DepartureBoard data={data} now={new Date("2026-09-16T12:00:30.001Z").getTime()} stale={false} />);
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
