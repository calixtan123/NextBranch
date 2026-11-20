#!/usr/bin/env python3
"""Capture redacted, paced TfL line-and-stop arrival comparison triads.

This is a release-evidence tool.  It never runs a live request unless the
operator supplies ``--live`` and a ``TFL_API_KEY`` environment value.  It is
deliberately serial because each attempt consumes the shared key's budget.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Callable

BASE_URL = "https://api.tfl.gov.uk"
MINIMUM_SPACING_SECONDS = 2.0
MAX_ATTEMPTS_PER_MINUTE = 30
TIMEOUT_SECONDS = 8.0
MAX_RESPONSE_BYTES = 2_000_000
SAFE_FIELDS = (
    "id", "vehicleId", "naptanId", "lineId", "destinationNaptanId",
    "destinationName", "timestamp", "expectedArrival", "platformName",
    "direction", "towards", "timeToStation",
)


class CaptureStopped(RuntimeError):
    """Raised when a 429 makes continued capture unsafe."""

    def __init__(self, message: str, manifest: dict[str, Any] | None = None, response: "Response | None" = None) -> None:
        super().__init__(message)
        self.manifest = manifest
        self.response = response


@dataclass(frozen=True)
class Response:
    """The metadata and safe JSON body retained for one request."""

    status: int
    retry_after: str | None
    body: Any
    duration_ms: int
    response_bytes: int = 0
    body_kind: str = "missing"
    started_at: str | None = None


def utc_now() -> str:
    """Return an ISO-8601 UTC time suitable for a manifest."""
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def safe_value(value: Any, credential: str = "") -> str | int | float | bool | None:
    """Return a bounded scalar that cannot be a URL or obvious credential echo."""
    if not isinstance(value, (str, int, float, bool, type(None))):
        return None
    if not isinstance(value, str):
        return value
    lowered = value.lower()
    encoded_credential = urllib.parse.quote(credential, safe="").lower()
    decoded_value = urllib.parse.unquote(value).lower()
    if (len(value) > 256 or not value.isascii() or "http" in lowered or "?" in value or
            "app_key" in lowered or "api_key" in lowered or "token=" in lowered or
            (credential and (credential.lower() in lowered or encoded_credential in lowered or credential.lower() in decoded_value))):
        return None
    return value


def redacted_records(body: Any, credential: str = "") -> list[dict[str, Any]]:
    """Keep only comparison fields from a TfL arrivals array."""
    if not isinstance(body, list):
        return []
    records = []
    for item in body:
        if not isinstance(item, dict):
            continue
        row = {}
        for field in SAFE_FIELDS:
            value = safe_value(item.get(field), credential) if field in item else None
            if value is not None or (field in item and item[field] is None):
                row[field] = value
        records.append(row)
    return records


def parse_retry_after(value: str | None) -> str | None:
    """Normalize Retry-After, discarding untrusted header text."""
    if value and value.isascii() and value.isdecimal() and len(value) <= 10:
        return str(int(value))
    if value:
        try:
            return parsedate_to_datetime(value).astimezone(UTC).isoformat().replace("+00:00", "Z")
        except (TypeError, ValueError, IndexError):
            pass
    return None


class PacedCapture:
    """Serial request scheduler that enforces spacing and a rolling budget."""

    def __init__(
        self,
        key: str,
        cap_per_minute: int,
        request: Callable[[str], Response],
        monotonic: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not 1 <= cap_per_minute <= MAX_ATTEMPTS_PER_MINUTE:
            raise ValueError("--available-headroom must be between 1 and 30")
        self.key = key
        self.cap_per_minute = cap_per_minute
        self.request = request
        self.monotonic = monotonic
        self.sleep = sleep
        self.attempts: deque[float] = deque()
        self.last_attempt: float | None = None

    def fetch(self, path: str) -> Response:
        """Make one paced attempt and fail closed after a rate-limit response."""
        now = self.monotonic()
        if self.last_attempt is not None:
            self.sleep(max(0.0, MINIMUM_SPACING_SECONDS - (now - self.last_attempt)))
        now = self.monotonic()
        while self.attempts and now - self.attempts[0] >= 60.0:
            self.attempts.popleft()
        if len(self.attempts) >= self.cap_per_minute:
            raise CaptureStopped("Rolling available-headroom budget reached. Review budget before resuming.")
        self.attempts.append(now)
        self.last_attempt = now
        response = self.request(path)
        if response.status == 429:
            retry = response.retry_after or "not supplied"
            raise CaptureStopped(
                f"TfL returned 429. Retry-After: {retry}. Stop and review cooldown and shared-key budget before resuming.",
                response=response,
            )
        return response


def live_request(key: str) -> Callable[[str], Response]:
    """Build the only live transport, fixed to TfL HTTPS without redirects."""
    def request(path: str) -> Response:
        url = f"{BASE_URL}{path}?{urllib.parse.urlencode({'app_key': key})}"
        started = time.monotonic()
        started_at = utc_now()
        # HTTPRedirectHandler would follow redirects, so block them explicitly.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
                return None
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        try:
            with opener.open(url, timeout=TIMEOUT_SECONDS) as raw:
                try:
                    payload = raw.read(MAX_RESPONSE_BYTES + 1)
                except (OSError, http.client.HTTPException):
                    return Response(
                        raw.status,
                        parse_retry_after(raw.headers.get("Retry-After")),
                        None,
                        round((time.monotonic() - started) * 1000),
                        body_kind="read-error",
                        started_at=started_at,
                    )
                if len(payload) > MAX_RESPONSE_BYTES:
                    return Response(raw.status, parse_retry_after(raw.headers.get("Retry-After")), None, round((time.monotonic() - started) * 1000), len(payload), "too-large", started_at)
                try:
                    body = json.loads(payload)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    return Response(raw.status, parse_retry_after(raw.headers.get("Retry-After")), None, round((time.monotonic() - started) * 1000), len(payload), "malformed", started_at)
                if body == []:
                    kind = "empty"
                elif isinstance(body, list) and all(isinstance(item, dict) for item in body):
                    kind = "arrivals"
                elif isinstance(body, list):
                    kind = "arrivals-with-invalid-records"
                else:
                    kind = "malformed"
                return Response(raw.status, parse_retry_after(raw.headers.get("Retry-After")), body, round((time.monotonic() - started) * 1000), len(payload), kind, started_at)
        except urllib.error.HTTPError as error:
            return Response(error.code, parse_retry_after(error.headers.get("Retry-After")), None, round((time.monotonic() - started) * 1000), started_at=started_at)
        except (OSError, http.client.HTTPException):
            return Response(0, None, None, round((time.monotonic() - started) * 1000), started_at=started_at)
    return request


def capture_triads(capture: PacedCapture, line: str, stops: list[str]) -> dict[str, Any]:
    """Capture stop, line, stop snapshots for every supplied stop in order."""
    triads: list[dict[str, Any]] = []
    for stop in stops:
        triad_started = capture.monotonic()
        samples = []
        encoded_line = urllib.parse.quote(line, safe="")
        encoded_stop = urllib.parse.quote(stop, safe="")
        paths = {
            "before": f"/Line/{encoded_line}/Arrivals/{encoded_stop}",
            "line": f"/Line/{encoded_line}/Arrivals",
            "after": f"/Line/{encoded_line}/Arrivals/{encoded_stop}",
        }
        for label in ("before", "line", "after"):
            try:
                response = capture.fetch(paths[label])
            except CaptureStopped as error:
                response = getattr(error, "response", None)
                if response is not None:
                    samples.append(sample(label, response, capture.key))
                triads.append({"lineId": line, "stopAreaId": stop, "elapsedMs": round((capture.monotonic() - triad_started) * 1000), "samples": samples})
                manifest = {"format": "tfl-arrival-capture/v1", "capturedAt": utc_now(), "triads": triads, "stopped": {"reason": str(error)}}
                raise CaptureStopped(str(error), manifest) from None
            samples.append(sample(label, response, capture.key))
        triads.append({"lineId": line, "stopAreaId": stop, "elapsedMs": round((capture.monotonic() - triad_started) * 1000), "samples": samples})
    return {"format": "tfl-arrival-capture/v1", "capturedAt": utc_now(), "triads": triads}


def sample(label: str, response: Response, credential: str) -> dict[str, Any]:
    """Convert one response to the strictly redacted evidence representation."""
    return {"kind": label, "startedAt": response.started_at, "completedAt": utc_now(), "status": response.status,
            "durationMs": response.duration_ms, "responseBytes": response.response_bytes,
            "bodyKind": response.body_kind, "retryAfter": response.retry_after,
            "records": redacted_records(response.body, credential)}


def valid_identifier(value: str) -> bool:
    """Allow the compact identifiers accepted in known TfL line and stop paths."""
    return bool(value) and len(value) <= 64 and all(character.isalnum() or character in "_-" for character in value)


def parse_args(argv: list[str]) -> argparse.Namespace:
    """Parse the intentionally explicit live capture interface."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Permit live TfL requests.")
    parser.add_argument("--line", required=True)
    parser.add_argument("--stop", action="append", required=True, dest="stops")
    parser.add_argument("--available-headroom", type=int, required=True, help="Reserved free attempts in the shared key's rolling minute, 1..30.")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Run a live capture only after validating all local safety gates."""
    args = parse_args(argv if argv is not None else sys.argv[1:])
    if not valid_identifier(args.line) or any(not valid_identifier(stop) for stop in args.stops):
        raise SystemExit("Line and stop identifiers must use only letters, digits, hyphens, or underscores.")
    if not args.live:
        raise SystemExit("Refusing network access. Supply --live after fixture verification and quota review.")
    key = os.environ.get("TFL_API_KEY")
    if not key:
        raise SystemExit("Set TFL_API_KEY in the environment before a live capture.")
    if key == args.line or key in args.stops:
        raise SystemExit("Refusing identifiers that equal TFL_API_KEY.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        raise SystemExit("Refusing to overwrite existing capture evidence. Choose a new --output path.")
    try:
        manifest = capture_triads(PacedCapture(key, args.available_headroom, live_request(key)), args.line, args.stops)
    except CaptureStopped as error:
        if error.manifest is not None:
            write_manifest(args.output, error.manifest)
        raise SystemExit(str(error)) from None
    write_manifest(args.output, manifest)
    return 0


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    """Create evidence once, preventing a later run from overwriting it."""
    with path.open("x", encoding="utf-8") as destination:
        json.dump(manifest, destination, indent=2)
        destination.write("\n")


if __name__ == "__main__":
    raise SystemExit(main())
