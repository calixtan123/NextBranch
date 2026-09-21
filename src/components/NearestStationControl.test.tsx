/** Verifies opt-in location errors, confirmation boundaries, selection, and privacy. */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NearestStationControl from "./NearestStationControl";

type GeolocationErrorCode = 1 | 2 | 3;

const getCurrentPosition = vi.fn();
const originalGeolocation = navigator.geolocation;

function renderControl(onStation = vi.fn()) {
  render(<NearestStationControl onStation={onStation} />);
  return onStation;
}

function setGeolocation(value: Geolocation | undefined) {
  Object.defineProperty(navigator, "geolocation", { configurable: true, value });
}

function position(latitude: number, longitude: number, accuracy: number): GeolocationPosition {
  return { coords: { latitude, longitude, accuracy } } as GeolocationPosition;
}

function error(code: GeolocationErrorCode): GeolocationPositionError {
  return { code } as GeolocationPositionError;
}

afterEach(() => {
  getCurrentPosition.mockReset();
  setGeolocation(originalGeolocation);
});

describe("NearestStationControl", () => {
  // Break: a browser without location support tries to use an unavailable API or hides manual selection guidance.
  it("keeps manual selection available when geolocation is unsupported", () => {
    setGeolocation(undefined);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "Use nearest station" }));

    expect(screen.getByRole("alert")).toHaveTextContent("does not support location");
  });

  // Break: a browser permission failure leaves the user without a useful recovery path.
  it.each([
    [1, "Location permission was denied."],
    [2, "Your location is currently unavailable."],
    [3, "Location request timed out."],
  ])("explains geolocation error code %s while retaining manual selection", (code, message) => {
    getCurrentPosition.mockImplementation((_success, failure) => failure(error(code as GeolocationErrorCode)));
    setGeolocation({ getCurrentPosition } as unknown as Geolocation);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "Use nearest station" }));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a station manually.");
  });

  // Break: low-accuracy browser readings silently choose a potentially wrong station.
  it("requires confirmation when browser accuracy is worse than 250 metres", () => {
    getCurrentPosition.mockImplementation((success) => success(position(51.5393, -0.1427, 251)));
    setGeolocation({ getCurrentPosition } as unknown as Geolocation);
    const onStation = renderControl();

    fireEvent.click(screen.getByRole("button", { name: "Use nearest station" }));

    expect(screen.getByRole("status")).toHaveTextContent("Camden Town");
    expect(screen.getByRole("status")).toHaveTextContent(/metres away/);
    expect(screen.getByRole("button", { name: "Use Camden Town" })).toBeInTheDocument();
    expect(onStation).not.toHaveBeenCalled();
  });

  // Break: closely matched stations silently select an arbitrary result.
  it("requires confirmation when the nearest two stations are within 150 metres", () => {
    getCurrentPosition.mockImplementation((success) => success(position(51.50811475, -0.124042, 10)));
    setGeolocation({ getCurrentPosition } as unknown as Geolocation);
    const onStation = renderControl();

    fireEvent.click(screen.getByRole("button", { name: "Use nearest station" }));

    expect(screen.getByRole("status")).toHaveTextContent("nearest result is close to another station");
    expect(onStation).not.toHaveBeenCalled();
  });

  // Break: a normal accurate result requires needless extra confirmation or selects a non-canonical station.
  it("selects the nearest canonical station immediately for a clear accurate result", () => {
    getCurrentPosition.mockImplementation((success) => success(position(51.5393, -0.1427, 20)));
    setGeolocation({ getCurrentPosition } as unknown as Geolocation);
    const onStation = renderControl();

    fireEvent.click(screen.getByRole("button", { name: "Use nearest station" }));

    expect(onStation).toHaveBeenCalledWith(expect.objectContaining({ id: "940GZZLUCTN", name: "Camden Town" }));
    expect(screen.queryByRole("button", { name: "Use Camden Town" })).not.toBeInTheDocument();
  });

  // Break: raw browser coordinates leak through the component boundary instead of only the canonical station choice.
  it("only returns the reviewed canonical station after confirmation", () => {
    getCurrentPosition.mockImplementation((success) => success(position(51.5393, -0.1427, 251)));
    setGeolocation({ getCurrentPosition } as unknown as Geolocation);
    const onStation = renderControl();

    fireEvent.click(screen.getByRole("button", { name: "Use nearest station" }));
    fireEvent.click(screen.getByRole("button", { name: "Use Camden Town" }));

    expect(onStation).toHaveBeenCalledTimes(1);
    const selected = onStation.mock.calls[0]?.[0];
    expect(selected).toEqual({ id: "940GZZLUCTN", name: "Camden Town", aliases: [], branch: "both" });
    expect(selected).not.toHaveProperty("latitude");
    expect(selected).not.toHaveProperty("longitude");
  });
});
