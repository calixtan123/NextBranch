import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShareControl, { buildShareUrl } from "./ShareControl";

const station = { type: "station" as const, stationId: "940GZZLUCTN" };
const journey = { type: "journey" as const, from: "940GZZLUCTN", to: "940GZZLUEGW" };

function setNavigatorProperty(name: "share" | "clipboard", value: unknown) {
  Object.defineProperty(navigator, name, { configurable: true, value });
}

describe("ShareControl", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "clipboard");
  });

  // Break: a station share retains incidental path/query state or uses a non-canonical parameter.
  it("builds an absolute canonical URL for a station", () => {
    expect(buildShareUrl("https://northern.example", station)).toBe("https://northern.example/?station=940GZZLUCTN");
  });

  // Break: a journey share reverses the selected stations or includes non-selection data.
  it("builds an absolute canonical URL for a journey", () => {
    expect(buildShareUrl("https://northern.example", journey)).toBe("https://northern.example/?from=940GZZLUCTN&to=940GZZLUEGW");
  });

  // Break: supported native sharing is bypassed or receives a URL containing unrelated browser state.
  it("uses native sharing with the canonical station URL when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigatorProperty("share", share);
    render(<ShareControl selection={station} label="Share Camden Town departures" />);

    fireEvent.click(screen.getByRole("button", { name: "Share Camden Town departures" }));

    await waitFor(() => expect(share).toHaveBeenCalledWith({ url: `${window.location.origin}/?station=940GZZLUCTN` }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Break: cancelling the operating system's share sheet is presented as an error or unexpectedly copies a link.
  it("treats native share cancellation as a neutral outcome", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigatorProperty("share", vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")));
    setNavigatorProperty("clipboard", { writeText });
    render(<ShareControl selection={station} label="Share Camden Town departures" />);

    fireEvent.click(screen.getByRole("button", { name: "Share Camden Town departures" }));

    await waitFor(() => expect(navigator.share).toHaveBeenCalledTimes(1));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Break: an ordinary native-share failure leaves the passenger without a usable link even though copying is possible.
  it("falls back to the clipboard after native sharing rejects", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigatorProperty("share", vi.fn().mockRejectedValue(new Error("Share unavailable")));
    setNavigatorProperty("clipboard", { writeText });
    render(<ShareControl selection={journey} label="Share Camden Town to Edgware journey" />);

    fireEvent.click(screen.getByRole("button", { name: "Share Camden Town to Edgware journey" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?from=940GZZLUCTN&to=940GZZLUEGW`));
    expect(screen.getByRole("status")).toHaveTextContent("Link copied");
  });

  // Break: browsers without native sharing do not give a successful clipboard action accessible feedback.
  it("announces exactly Link copied after copying a URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigatorProperty("clipboard", { writeText });
    render(<ShareControl selection={station} label="Share Camden Town departures" />);

    fireEvent.click(screen.getByRole("button", { name: "Share Camden Town departures" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Link copied");
    expect(screen.getByRole("status")).toHaveTextContent(/^Link copied$/);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?station=940GZZLUCTN`);
  });

  // Break: both browser mechanisms failing gives no accessible explanation, leaving the current page ambiguous.
  it("reports an accessible error when native sharing and clipboard copying fail", async () => {
    setNavigatorProperty("share", vi.fn().mockRejectedValue(new Error("Share unavailable")));
    setNavigatorProperty("clipboard", { writeText: vi.fn().mockRejectedValue(new Error("Clipboard unavailable")) });
    render(<ShareControl selection={station} label="Share Camden Town departures" />);

    fireEvent.click(screen.getByRole("button", { name: "Share Camden Town departures" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to share link.");
  });
});
