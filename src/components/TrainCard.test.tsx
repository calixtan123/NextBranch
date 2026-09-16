import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TrainCard from "./TrainCard";
import type { JourneyTrain } from "@/lib/journey-view";

const train: JourneyTrain = { id: "a", destinationName: "Morden", expectedArrival: "2026-09-16T10:05:00.000Z", secondsToOrigin: 120, platform: null, direction: "Southbound", platformConfirmed: false, routeConfidence: "inferred", via: "Bank", destinationArrival: "2026-09-16T10:25:00.000Z", destinationSeconds: 1320, evidence: "estimate" };
describe("train card", () => {
  it("makes uncertainty and unconfirmed platform explicit", () => {
    render(<TrainCard train={train} rank="NEXT & FASTEST ARRIVAL" fresh />);
    expect(screen.getByText("Southbound · Platform unconfirmed")).toBeInTheDocument();
    expect(screen.getByText("Route inferred from TfL service data")).toBeInTheDocument();
    expect(screen.getByText(/~.*Estimated/)).toBeInTheDocument();
  });
  it("removes recommendation language when stale", () => {
    render(<TrainCard train={train} rank="NEXT TRAIN" fresh={false} />);
    expect(screen.queryByText("NEXT TRAIN")).not.toBeInTheDocument();
  });
  it("uses full ETA evidence labels and renders a supplied saving", () => {
    render(<TrainCard train={train} fresh minutesSaved={3} />);
    expect(screen.getByText(/Estimated/)).toBeInTheDocument();
    expect(screen.getByText("Arrives 3 min earlier")).toBeInTheDocument();
    expect(screen.getByLabelText("Destination ETA: Estimated")).toBeInTheDocument();
  });
  it("mutes stale countdowns and names unavailable destination ETAs", () => {
    render(<TrainCard train={{ ...train, destinationArrival: null, evidence: "unavailable" }} fresh={false} />);
    expect(screen.getByText("Destination ETA unavailable")).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveClass("stale");
    expect(screen.queryByText(/Arrives/)).not.toBeInTheDocument();
  });
});
