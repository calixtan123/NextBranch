"""Fixture-only tests for the paced TfL arrival evidence runner."""
import importlib.util
from pathlib import Path
import sys
import json
import io
import http.client

import pytest

SCRIPT = Path(__file__).parents[2] / "scripts" / "capture-tfl-arrivals.py"
SPEC = importlib.util.spec_from_file_location("capture_tfl_arrivals", SCRIPT)
runner = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)


class Clock:
    def __init__(self): self.value = 0.0
    def now(self): return self.value
    def sleep(self, duration): self.value += duration


def response(status=200, body=None, retry_after=None):
    return runner.Response(status, retry_after, body if body is not None else [], 12, 22, "arrivals")


def test_triads_are_serial_paced_and_redacted():
    clock = Clock()
    paths = []
    capture = runner.PacedCapture("secret", 30, lambda path: paths.append(path) or response(body=[{"id": "a", "secret": "drop"}]), clock.now, clock.sleep)
    manifest = runner.capture_triads(capture, "northern", ["940GZZLUCTN"])
    assert paths == [
        "/Line/northern/Arrivals/940GZZLUCTN",
        "/Line/northern/Arrivals",
        "/Line/northern/Arrivals/940GZZLUCTN",
    ]
    assert clock.value == 4.0
    assert manifest["triads"][0]["samples"][0]["records"] == [{"id": "a"}]


def test_rolling_headroom_counts_failed_attempts():
    clock = Clock()
    capture = runner.PacedCapture("secret", 1, lambda _: response(500), clock.now, clock.sleep)
    assert capture.fetch("/Line/northern/Arrivals/a").status == 500
    with pytest.raises(runner.CaptureStopped, match="Rolling"):
        capture.fetch("/Line/northern/Arrivals/a")


def test_429_stops_and_retains_safe_retry_after():
    clock = Clock()
    capture = runner.PacedCapture("secret", 30, lambda _: response(429, retry_after="61"), clock.now, clock.sleep)
    with pytest.raises(runner.CaptureStopped, match="Retry-After: 61"):
        capture.fetch("/Line/northern/Arrivals/a")


def test_untrusted_header_and_nested_values_do_not_reach_evidence():
    assert runner.parse_retry_after("x\\nsecret") is None
    assert runner.redacted_records([{"id": "safe", "towards": {"secret": "drop"}, "destinationName": "https://api.tfl.gov.uk/?app_key=secret"}]) == [{"id": "safe"}]
    assert runner.redacted_records([{"id": "actual-secret", "towards": "%61ctual-secret", "destinationName": "?app_key=actual-secret"}], "actual-secret") == [{}]


def test_cli_writes_partial_redacted_429_manifest_without_secret(monkeypatch, tmp_path):
    output = tmp_path / "partial.json"
    monkeypatch.setenv("TFL_API_KEY", "actual-secret")
    monkeypatch.setattr(runner, "live_request", lambda _: lambda _: response(429, [{"id": "actual-secret", "towards": "app_key=actual-secret"}], "9"))
    with pytest.raises(SystemExit, match="TfL returned 429"):
        runner.main(["--live", "--line", "northern", "--stop", "a", "--available-headroom", "30", "--output", str(output)])
    evidence = output.read_text()
    assert "actual-secret" not in evidence
    assert json.loads(evidence)["triads"][0]["samples"][0]["status"] == 429


def test_live_transport_keeps_key_out_of_redacted_records(monkeypatch):
    class Raw:
        status = 200
        headers = {"Retry-After": None}
        def read(self, _: int): return b'[{"id":"safe","towards":"app_key=actual-secret"}]'
        def __enter__(self): return self
        def __exit__(self, *_): return False
    observed = []
    class Opener:
        def open(self, url, timeout):
            observed.append((url, timeout))
            return Raw()
    monkeypatch.setattr(runner.urllib.request, "build_opener", lambda *_: Opener())
    result = runner.live_request("actual-secret")("/Line/northern/Arrivals")
    assert "actual-secret" in observed[0][0]
    assert runner.redacted_records(result.body) == [{"id": "safe"}]


def test_malformed_json_keeps_status_and_byte_count(monkeypatch):
    class Raw:
        status = 200
        headers = {"Retry-After": None}
        def read(self, _: int): return b"not-json"
        def __enter__(self): return self
        def __exit__(self, *_): return False
    class Opener:
        def open(self, *_, **__): return Raw()
    monkeypatch.setattr(runner.urllib.request, "build_opener", lambda *_: Opener())
    result = runner.live_request("secret")("/Line/northern/Arrivals")
    assert (result.status, result.response_bytes, result.body_kind) == (200, 8, "malformed")


@pytest.mark.parametrize("error", [
    ConnectionResetError("actual-secret"),
    http.client.IncompleteRead(b"actual-secret"),
])
def test_cli_preserves_samples_when_a_response_body_read_fails(monkeypatch, tmp_path, error):
    """Persist earlier samples and a redacted failure when a body read breaks."""
    class Raw(io.BytesIO):
        status = 200
        headers = {}

        def read(self, size):
            if self.getvalue() == b"broken":
                raise error
            return super().read(size)

    bodies = iter([b"[]", b"broken", b"[]"])
    class Opener:
        def open(self, *_args, **_kwargs):
            return Raw(next(bodies))

    monkeypatch.setenv("TFL_API_KEY", "actual-secret")
    monkeypatch.setattr(runner.urllib.request, "build_opener", lambda *_: Opener())
    clock = Clock()
    paced_capture = runner.PacedCapture
    monkeypatch.setattr(runner, "PacedCapture", lambda *args: paced_capture(*args, clock.now, clock.sleep))
    output = tmp_path / "capture.json"

    assert runner.main(["--live", "--line", "northern", "--stop", "a", "--available-headroom", "3", "--output", str(output)]) == 0

    evidence = output.read_text()
    samples = json.loads(evidence)["triads"][0]["samples"]
    assert [item["bodyKind"] for item in samples] == ["empty", "read-error", "empty"]
    assert samples[1]["status"] == 200
    assert samples[1]["records"] == []
    assert "actual-secret" not in evidence


def test_live_requires_explicit_opt_in_without_network(monkeypatch, tmp_path):
    monkeypatch.setenv("TFL_API_KEY", "secret")
    with pytest.raises(SystemExit, match="Refusing network"):
        runner.main(["--line", "northern", "--stop", "a", "--available-headroom", "30", "--output", str(tmp_path / "x.json")])
