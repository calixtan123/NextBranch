"""Exercise source joins, all export formats and refresh failure recovery."""

import csv
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import zipfile

import pytest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("refresh", ROOT / "scripts/refresh-tfl-catalogue.py")
refresh = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(refresh)


@pytest.fixture
def source_tables():
    """Provide a tiny valid official-schema source with shared services and blanks."""
    return {
        "Stations.csv": [
            ["UniqueId", "Name", "FareZones", "HubNaptanCode"],
            ["HUBTEST", "Test Station", "2", "HUBTEST"],
        ],
        "Platforms.csv": [
            ["UniqueId", "StationUniqueId", "PlatformNumber", "FriendlyName", "CardinalDirection", "PlatformNaptanCode", "IsCustomerFacing"],
            ["published-id", "HUBTEST", "", "Passenger platform", "", "", "TRUE"],
        ],
        "PlatformServices.csv": [
            ["PlatformUniqueId", "Line", "DirectionTowards", "StopAreaNaptanCode"],
            ["published-id", "district", "", "940TEST"],
            ["published-id", "national-rail", "", "910TEST"],
        ],
        "ModesAndLines.csv": [["Name", "Mode"], ["district", "tube"], ["national-rail", "nationalRail"]],
        "FeedInfo.csv": [["FeedStartDate"], ["2026-10-20T13:56+00:00"]],
    }


@pytest.fixture
def archive_factory(tmp_path):
    """Create independent source archives without downloading during tests."""
    def create(tables):
        archive = tmp_path / "source.zip"
        with zipfile.ZipFile(archive, "w") as output:
            for name, rows in tables.items():
                text = io.StringIO(newline="")
                csv.writer(text).writerows(rows)
                output.writestr(name, text.getvalue().encode("utf-8-sig"))
        return archive
    return create


def test_refresh_rebuilds_equal_json_csv_xlsx_and_repeats_safely(tmp_path, source_tables, archive_factory):
    """Arrange official tables, run refresh twice, assert all three exports agree."""
    archive = archive_factory(source_tables)
    destination = tmp_path / "inventory"
    command = ["python3", str(ROOT / "scripts/refresh-tfl-catalogue.py"), "--archive", str(archive), "--sha256", hashlib.sha256(archive.read_bytes()).hexdigest(), "--retrieved-on", "2026-11-10", "--output", str(destination)]
    for _ in range(2):
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        assert json.loads(result.stdout)["platform_service_count"] == 2
    snapshot = json.loads((destination / f"{refresh.BASENAME}.json").read_text())
    assert snapshot["stations"][0]["platforms"][0]["platform_number"] == ""
    assert snapshot["stations"][0]["platforms"][0]["cardinal_direction"] == ""
    assert len(snapshot["stations"][0]["platforms"][0]["services"]) == 2
    with (destination / f"{refresh.BASENAME}.csv").open(encoding="utf-8-sig", newline="") as stream:
        assert len(list(csv.DictReader(stream))) == 2
    assert set(path.suffix for path in destination.iterdir()) == {".json", ".csv", ".xlsx"}
    assert not (tmp_path / ".inventory.previous").exists()
    assert not (tmp_path / ".inventory.refresh.lock").exists()


@pytest.mark.parametrize("table,row,column,value", [
    ("Platforms.csv", 1, 1, "missing-station"),
    ("PlatformServices.csv", 1, 0, "missing-platform"),
    ("PlatformServices.csv", 1, 1, "invented-line"),
    ("ModesAndLines.csv", 1, 1, "bus"),
    ("Platforms.csv", 1, 6, "maybe"),
])
def test_extract_rejects_broken_joins_line_references_and_values(source_tables, archive_factory, table, row, column, value):
    source_tables[table][row][column] = value
    with pytest.raises(ValueError):
        refresh.extract_snapshot(archive_factory(source_tables), "2026-11-10")


def test_duplicate_source_ids_are_rejected(source_tables, archive_factory):
    source_tables["Stations.csv"].append(source_tables["Stations.csv"][1])
    with pytest.raises(ValueError, match="Duplicate"):
        refresh.extract_snapshot(archive_factory(source_tables), "2026-11-10")


@pytest.mark.parametrize("change", ["header", "ragged"])
def test_malformed_source_tables_are_rejected(source_tables, archive_factory, change):
    if change == "header":
        source_tables["Stations.csv"][0][0] = "WrongColumn"
    else:
        source_tables["Stations.csv"][1].pop()
    with pytest.raises(ValueError):
        refresh.extract_snapshot(archive_factory(source_tables), "2026-11-10")


def test_validation_failure_preserves_existing_bundle(tmp_path, source_tables, archive_factory):
    archive = archive_factory(source_tables)
    snapshot = refresh.extract_snapshot(archive, "2026-11-10")
    snapshot["metadata"]["station_count"] = 999
    staged = tmp_path / "next"
    staged.mkdir()
    with pytest.raises(subprocess.CalledProcessError):
        refresh.build_bundle(snapshot, staged)
    assert not (staged / f"{refresh.BASENAME}.csv").exists()


def test_failed_publication_restores_existing_directory(tmp_path, monkeypatch):
    destination, staged = tmp_path / "inventory", tmp_path / "next"
    destination.mkdir()
    staged.mkdir()
    (destination / f"{refresh.BASENAME}.json").write_text("previous")
    original_rename = Path.rename

    def failing_rename(self, target):
        if self == staged:
            raise OSError("simulated publication failure")
        return original_rename(self, target)

    monkeypatch.setattr(Path, "rename", failing_rename)
    with pytest.raises(OSError, match="simulated"):
        refresh.publish_bundle(staged, destination)
    assert (destination / f"{refresh.BASENAME}.json").read_text() == "previous"
    assert not (tmp_path / ".inventory.previous").exists()


def test_failed_rollback_retains_backup_for_recovery(tmp_path, monkeypatch):
    destination, staged = tmp_path / "inventory", tmp_path / "next"
    destination.mkdir()
    staged.mkdir()
    (destination / f"{refresh.BASENAME}.json").write_text("previous")
    original_rename = Path.rename

    def failing_rename(self, target):
        if self == staged or self.name == ".inventory.previous":
            raise OSError("simulated failure")
        return original_rename(self, target)

    monkeypatch.setattr(Path, "rename", failing_rename)
    with pytest.raises(OSError):
        refresh.publish_bundle(staged, destination)
    assert (tmp_path / ".inventory.previous" / f"{refresh.BASENAME}.json").read_text() == "previous"


def test_checksum_failure_and_existing_writer_lock_leave_output_unchanged(tmp_path, source_tables, archive_factory):
    archive = archive_factory(source_tables)
    destination = tmp_path / "inventory"
    command = ["python3", str(ROOT / "scripts/refresh-tfl-catalogue.py"), "--archive", str(archive), "--retrieved-on", "2026-11-10", "--output", str(destination)]
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    result = subprocess.run(command + ["--sha256", "wrong"], capture_output=True, text=True)
    assert result.returncode != 0
    assert "checksum" in result.stderr
    lock = tmp_path / ".inventory.refresh.lock"
    lock.write_text("another writer")
    result = subprocess.run(command + ["--sha256", checksum], capture_output=True, text=True)
    assert result.returncode != 0
    assert lock.read_text() == "another writer"
    assert not destination.exists()


def test_publication_rejects_unrelated_files_and_interrupted_previous_bundle(tmp_path):
    destination, staged = tmp_path / "inventory", tmp_path / "next"
    destination.mkdir()
    staged.mkdir()
    (destination / "unrelated.txt").write_text("keep")
    with pytest.raises(ValueError, match="outside"):
        refresh.publish_bundle(staged, destination)
    backup = tmp_path / ".inventory.previous"
    backup.mkdir()
    with pytest.raises(FileExistsError, match="interrupted"):
        refresh.publish_bundle(staged, destination)
    assert (destination / "unrelated.txt").read_text() == "keep"
