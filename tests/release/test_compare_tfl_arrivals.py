"""Exercise the offline TfL comparison through its Node CLI."""

import gzip
import json
from pathlib import Path
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "compare-tfl-arrivals.mjs"
STOP = "940GZZLUCTN"


def stamp(seconds):
    """Format the fixture's fixed UTC clock."""
    return f"2026-11-25T14:{seconds // 60:02d}:{seconds % 60:02d}Z"


def record(vehicle="123", eta=133, **fields):
    """Build an arrival with a real catalogue service and a synthetic vehicle."""
    return {
        "vehicleId": vehicle,
        "naptanId": STOP,
        "lineId": "northern",
        "destinationNaptanId": "940GZZLUEGW",
        "expectedArrival": stamp(eta),
        "timestamp": stamp(0),
        "platformName": "Northbound - Platform 1",
        "direction": "outbound",
        "towards": "Edgware via Bank",
        **fields,
    }


def sample(kind, started, records, **fields):
    """Build the sample shape written by the NB-58 capture CLI."""
    return {
        "kind": kind,
        "startedAt": stamp(started),
        "completedAt": stamp(started + 1),
        "durationMs": 800,
        "status": 200,
        "bodyKind": "arrivals" if records else "empty",
        "records": records,
        **fields,
    }


def triad(*samples):
    """Build a sample bracket for the same line and stop."""
    return {"lineId": "northern", "stopAreaId": STOP, "samples": list(samples)}


def write_manifest(path, *triads):
    """Write an NB-58 window with the chosen sample brackets."""
    path.write_text(json.dumps({
        "format": "tfl-arrival-capture/v1",
        "capturedAt": stamp(25),
        "triads": triads,
    }))
    return path


def run_cli(*args):
    """Run the offline CLI from the repository root and capture its output."""
    return subprocess.run(
        ["node", str(SCRIPT), *map(str, args)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


def reports(result):
    """Decode successful JSONL output so tests can assert the report fields."""
    assert result.returncode == 0, result.stderr
    return [json.loads(line) for line in result.stdout.splitlines()]


def test_replay_uses_candidate_clock_and_reports_eta_platform_and_branch(tmp_path):
    # Arrange. At candidate completion, the reference arrivals are 130 and 134 seconds out.
    path = write_manifest(tmp_path / "capture.json", triad(
        sample("before", 0, [record(), record("124")]),
        sample("line", 2, [
            record(eta=150, platformName="Northbound - Platform 3", towards="Edgware via CX"),
            record("124", platformName="unknown", towards="Edgware"),
        ]),
        sample("after", 4, [record(eta=137), record("124")]),
    ))

    # Act.
    [report] = reports(run_cli(path))

    # Assert.
    assert report["lineId"] == "northern"
    assert report["candidate"] == "line"
    assert report["file"] == str(path)
    assert report["actualInterval"] == [stamp(0), stamp(5)]
    assert report["coverage"] == {"eligible": 2, "matched": 2, "missing": 0, "ambiguous": 0}
    assert report["repeatedEtaOutside"] == {"count": 2, "median": 0, "p95": 13, "max": 13}
    assert report["mismatchExamples"][0]["asOf"] == stamp(3)
    assert report["platformDiffers"] == report["platformUnresolved"] == 1
    assert report["branchDiffers"] == report["branchUnresolved"] == 1
    assert report["statusCounts"] == {"200": 1}
    assert report["usableAttempts"] == 1
    assert report["fetchMs"]["capturedDuration"]["p95"] == 800
    assert report["offlineParseMs"]["count"] == 1
    assert report["stationCount"] == 1


def test_excludes_incomplete_malformed_overlong_and_out_of_order_brackets(tmp_path):
    # Arrange.
    before = sample("before", 0, [record()])
    line = sample("line", 2, [record()])
    after = sample("after", 4, [record()])
    path = write_manifest(
        tmp_path / "capture.json",
        triad(before, line),
        triad(before, {**line, "records": {"broken": True}}, after),
        triad(before, line, sample("after", 16, [record()])),
        triad(before, {**line, "completedAt": "invalid"}, after),
        triad(before, line, sample("after", 1, [record()])),
        triad(before, line, line, after),
        triad(before, {**line, "status": 429}, after),
    )

    # Act.
    [report] = reports(run_cli(path))

    # Assert.
    assert [item["reason"] for item in report["excluded"]] == [
        "incomplete", "unusable-response", "overlong", "invalid-time",
        "out-of-order", "duplicate-sample", "unusable-response",
    ]
    assert report["coverage"]["eligible"] == 0
    assert report["attempts"] == 8
    assert report["statusCounts"] == {"200": 7, "429": 1}
    assert report["usableAttempts"] == 6


def test_counts_missing_and_ambiguous_candidates_after_line_and_stop_filtering(tmp_path):
    # Arrange.
    references = [record("125"), record("126"), record("127"), record("128"), record("128")]
    path = write_manifest(tmp_path / "capture.json", triad(
        sample("before", 0, references),
        sample("line", 2, [
            record("125", lineId="victoria"),
            record("125", naptanId="940GZZLUBNK"),
            record("126"),
            record("126", eta=135),
            record("127"),
        ]),
        sample("after", 4, references),
    ))

    # Act.
    [report] = reports(run_cli(path))

    # Assert.
    assert report["coverage"] == {"eligible": 3, "matched": 1, "missing": 1, "ambiguous": 1}
    assert report["ignoredRecords"]["ambiguousReferencePairs"] == 1
    assert report["ignoredRecords"]["outsideLineOrStop"]["candidate"] == 2
    assert report["repeatedEtaOutside"]["count"] == 1


@pytest.mark.parametrize("compressed", [False, True])
def test_public_windows_share_references_for_two_candidates_without_merging_files(tmp_path, compressed):
    # Arrange. Both files reuse slot zero, as independent captures can do.
    paths = []
    for index in range(2):
        rows = [
            sample("before", 0, [record()]),
            sample("mode", 2, [record(eta=134)] if index else []),
            sample("all_lines_at_stop", 4, [record()]),
            sample("after", 6, [record()]),
        ]
        payload = "\n".join(json.dumps({**row, "slot": 0, "stopAreaId": STOP}) for row in rows)
        path = tmp_path / f"window{index}.jsonl"
        if compressed:
            path = path.with_suffix(".jsonl.gz")
            path.write_bytes(gzip.compress(payload.encode()))
        else:
            path.write_text(payload)
        paths.append(path)

    # Act.
    without_line = run_cli(*paths)
    output = reports(run_cli("--line", "northern", *paths))

    # Assert.
    assert without_line.returncode != 0
    assert "--line" in without_line.stderr
    assert [(r["file"], r["candidate"], r["coverage"]["matched"]) for r in output] == [
        (str(paths[0]), "mode", 0), (str(paths[0]), "all_lines_at_stop", 1),
        (str(paths[1]), "mode", 1), (str(paths[1]), "all_lines_at_stop", 1),
    ]


def test_first_eligible_comparison_is_retained_when_identity_repeats(tmp_path):
    # Arrange. The same train is missing in the first bracket and matched in the second.
    path = write_manifest(
        tmp_path / "repeated.json",
        triad(sample("before", 0, [record()]), sample("line", 2, []), sample("after", 4, [record()])),
        triad(sample("before", 6, [record()]), sample("line", 8, [record()]), sample("after", 10, [record()])),
    )

    # Act.
    [report] = reports(run_cli(path))

    # Assert.
    assert report["coverage"] == {"eligible": 1, "matched": 0, "missing": 1, "ambiguous": 0}
    assert report["repeatedCoverage"] == {"eligible": 2, "matched": 1, "missing": 1, "ambiguous": 0}
    assert report["distinctFirstEtaOutside"]["p95"] is None
    assert report["repeatedEtaOutside"]["p95"] == 0


def test_public_reference_only_window_reports_missing_candidate(tmp_path):
    # Arrange. Interrupted public capture saved its reference but no candidate sample.
    path = tmp_path / "interrupted.jsonl"
    path.write_text(json.dumps({**sample("before", 0, [record()]), "slot": 0, "stopAreaId": STOP}))

    # Act.
    [report] = reports(run_cli("--line", "northern", path))

    # Assert.
    assert report["candidate"] == "unrecorded"
    assert report["attempts"] == 0
    assert report["excluded"] == [{"slot": 0, "stop": STOP, "reason": "incomplete", "status": [[200], [], []]}]


@pytest.mark.parametrize("body_kind", ["arrivals", "arrivals-with-invalid-records"])
def test_public_empty_mode_projection_is_missing_but_empty_unprojected_arrivals_is_malformed(tmp_path, body_kind):
    # Arrange. The upstream Tube response had lines, but its compared projection was empty.
    path = tmp_path / "projected.jsonl"
    rows = [
        sample("before", 0, [record()]),
        sample("mode", 2, [], bodyKind=body_kind, observedLines=["victoria", "northern", "victoria"]),
        sample("all_lines_at_stop", 4, [], bodyKind=body_kind, observedLines=["northern"]),
        sample("after", 6, [record()]),
    ]
    path.write_text("\n".join(json.dumps({**row, "slot": 0, "stopAreaId": STOP}) for row in rows))

    # Act.
    mode, all_lines = reports(run_cli("--line", "northern", path))

    # Assert.
    assert mode["usableAttempts"] == 1
    assert mode["coverage"] == {"eligible": 1, "matched": 0, "missing": 1, "ambiguous": 0}
    assert mode["observedLines"] == ["northern", "victoria"]
    assert mode["stationStats"][STOP]["candidateLines"] == []
    assert all_lines["usableAttempts"] == 0
    assert all_lines["excluded"][0]["reason"] == "unusable-response"


def test_countdown_compares_rendered_minutes_without_rounding_seconds_first(tmp_path):
    # Arrange. A 149.75-second arrival displays two minutes, and 150 displays three.
    before = [record(expectedArrival="2026-11-25T14:02:33Z")]
    candidate = [record(expectedArrival="2026-11-25T14:02:32.750Z")]
    path = write_manifest(tmp_path / "minute-boundary.json", triad(
        sample("before", 0, before), sample("line", 2, candidate), sample("after", 4, before),
    ))

    # Act.
    [report] = reports(run_cli(path))

    # Assert.
    assert report["coverage"]["matched"] == 1
    assert report["repeatedEtaOutside"]["p95"] == 0.25
    assert report["minuteCountdownDiffers"] == 1


def test_eta_percentiles_preserve_milliseconds_at_alert_threshold(tmp_path):
    # Arrange. The candidate ETA is 15.004 seconds outside the reference interval.
    path = write_manifest(tmp_path / "eta-boundary.json", triad(
        sample("before", 0, [record()]),
        sample("line", 2, [record(expectedArrival="2026-11-25T14:02:28.004Z")]),
        sample("after", 4, [record()]),
    ))

    # Act.
    [report] = reports(run_cli(path))

    # Assert.
    assert report["matchesOutside15Seconds"] == 1
    for field in ("distinctFirstEtaOutside", "repeatedEtaOutside"):
        assert report[field]["p95"] == 15.004
        assert report[field]["p95"] > report["methodology"]["etaOutsideThresholdSeconds"]


@pytest.mark.parametrize("counts", [{}, {"victoria": 14}])
def test_legacy_mode_empty_projection_cannot_confirm_http_200_usability(tmp_path, counts):
    # Arrange. The producer kept no Northern records for the schema to validate.
    path = tmp_path / "capacity-only.jsonl"
    path.write_text(json.dumps({
        "startedAt": stamp(0), "completedAt": stamp(1), "status": 200,
        "northern": [], "counts": counts, "stationCount": 1 if counts else 0,
    }))

    # Act.
    [report] = reports(run_cli("--line", "northern", path))

    # Assert.
    assert report["candidate"] == "mode"
    assert report["statusCounts"] == {"200": 1}
    assert report["observedLines"] == list(counts)
    assert report["usableAttempts"] == 0
    assert report["unknownUsabilityAttempts"] == 1
    assert report["offlineParseMs"]["count"] == 0


@pytest.mark.parametrize("counts,expected_lines", [
    ({"northern": 1, "victoria": 14, "central": 22, "circle": 0,
      "jubilee": "5", "district": 1.5, "piccadilly": -1, "invalid id": 1},
     ["central", "northern", "victoria"]),
    ({}, ["northern"]),
])
def test_legacy_mode_preserves_validated_upstream_lines_and_confirms_saved_predictions(
    tmp_path, counts, expected_lines,
):
    # Arrange. The producer kept a Northern arrival and separate upstream line counts.
    path = tmp_path / "capacity-only.jsonl"
    path.write_text(json.dumps({
        "startedAt": stamp(0), "completedAt": stamp(1), "status": 200,
        "northern": [record()], "counts": counts, "stationCount": 12,
    }))

    # Act.
    [report] = reports(run_cli("--line", "northern", path))

    # Assert.
    assert report["observedLines"] == expected_lines
    assert report["usableAttempts"] == 1
    assert report["unknownUsabilityAttempts"] == 0
    assert report["bracketCount"] == 0
    assert report["unbracketedAttempts"] == 1


def test_preserves_sanitized_retry_after_and_capture_stop_reason(tmp_path):
    # Arrange.
    reason = "TfL returned 429. Retry-After: 120. Stop and review cooldown and shared-key budget before resuming."
    path = write_manifest(
        tmp_path / "stopped.json",
        triad(sample("before", 0, [], status=503, retryAfter="2026-11-25T14:01:00Z")),
        triad(
            sample("before", 0, [record()], retryAfter="untrusted header"),
            sample("line", 2, [], status=429, retryAfter="120"),
        ),
    )
    manifest = json.loads(path.read_text())
    manifest["stopped"] = {"reason": reason}
    path.write_text(json.dumps(manifest))

    # Act.
    [report] = reports(run_cli(path))

    # Assert.
    assert report["captureStopped"] is True
    assert report["captureStopReason"] == reason
    assert report["retryAfterValues"] == ["120"]
    assert report["referenceResponses"]["before"]["retryAfterValues"] == ["2026-11-25T14:01:00Z"]

    # Report a stopped capture while dropping text outside the producer's known reasons.
    manifest["stopped"]["reason"] = "untrusted message"
    path.write_text(json.dumps(manifest))
    [report] = reports(run_cli(path))
    assert report["captureStopped"] is True
    assert report["captureStopReason"] is None
