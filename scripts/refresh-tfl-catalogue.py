"""Rebuild and validate a complete TfL JSON/CSV/XLSX bundle from the official ZIP.

The command uses Python's standard library and the application's installed Zod
boundary through Node 24. It stages all outputs before publishing, serializes
writers with a lock, and restores the previous directory if publication fails.
"""

import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from xml.etree import ElementTree as ET
import zipfile


ROOT = Path(__file__).resolve().parents[1]
BASENAME = "tfl-station-platform-lines"
SOURCE_URL = "https://api.tfl.gov.uk/stationdata/tfl-stationdata-detailed.zip"
SPECIFICATION_URL = "https://content.tfl.gov.uk/step-free-access-and-toilet-data-guide.pdf"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
CSV_FIELDS = [
    "Station", "Platform number", "Line", "Mode", "Platform direction",
    "Direction towards", "Platform name", "Customer facing", "Line ID",
    "Station ID", "Platform ID", "Platform NaPTAN", "Stop area NaPTAN",
]


def node_boundary(*arguments):
    """Run the application's shared validation or line-definition boundary.

    Parameters
    ----------
    *arguments : str
        Boundary command and optional snapshot path.

    Returns
    -------
    dict
        Validated metadata or supported line definitions.

    Raises
    ------
    subprocess.CalledProcessError
        If the shared validation process fails.
    """
    result = subprocess.run(
        ["node", str(ROOT / "scripts/catalogue-snapshot.mjs"), *arguments],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)


def read_table(archive, name, required):
    """Read a required UTF-8 source table and reject malformed headers/rows.

    Parameters
    ----------
    archive : zipfile.ZipFile
        Official source archive.
    name : str
        Source CSV member name.
    required : list of str
        Required source column names.

    Returns
    -------
    list of dict
        Source records with blank cells preserved.

    Raises
    ------
    ValueError
        If required columns or row cells are missing.
    """
    reader = csv.DictReader(io.StringIO(archive.read(name).decode("utf-8-sig")))
    if not set(required).issubset(reader.fieldnames or []):
        raise ValueError(f"Missing required columns in {name}")
    rows = list(reader)
    if any(None in row or any(value is None for value in row.values()) for row in rows):
        raise ValueError(f"Malformed CSV row in {name}")
    return rows


def unique_rows(rows, key):
    """Index source records, rejecting duplicate or blank canonical IDs.

    Parameters
    ----------
    rows : list of dict
        Source records to index.
    key : str
        Canonical identifier column.

    Returns
    -------
    dict
        Source records indexed by their published identifier.

    Raises
    ------
    ValueError
        If a canonical identifier is blank or duplicated.
    """
    result = {}
    for row in rows:
        identifier = row[key]
        if not identifier or identifier in result:
            raise ValueError(f"Duplicate or blank {key}: {identifier}")
        result[identifier] = row
    return result


def extract_snapshot(archive_path, retrieved_on):
    """Join all source records without dropping blanks or unserved platforms.

    Parameters
    ----------
    archive_path : pathlib.Path
        Downloaded official ZIP archive.
    retrieved_on : str
        Actual retrieval date in YYYY-MM-DD format.

    Returns
    -------
    dict
        Complete nested snapshot, including provenance and source counts.

    Raises
    ------
    ValueError
        If source joins, line references or required values are inconsistent.
    zipfile.BadZipFile
        If the archive cannot be read.
    """
    lines = node_boundary("lines")
    with zipfile.ZipFile(archive_path) as archive:
        if archive.testzip():
            raise ValueError("Corrupt source archive")
        stations = unique_rows(read_table(archive, "Stations.csv", ["UniqueId", "Name", "FareZones", "HubNaptanCode"]), "UniqueId")
        platforms = unique_rows(read_table(archive, "Platforms.csv", ["UniqueId", "StationUniqueId", "PlatformNumber", "FriendlyName", "CardinalDirection", "PlatformNaptanCode", "IsCustomerFacing"]), "UniqueId")
        services = read_table(archive, "PlatformServices.csv", ["PlatformUniqueId", "Line", "DirectionTowards", "StopAreaNaptanCode"])
        modes = unique_rows(read_table(archive, "ModesAndLines.csv", ["Name", "Mode"]), "Name")
        feed = read_table(archive, "FeedInfo.csv", ["FeedStartDate"])
        if len(feed) != 1:
            raise ValueError("Expected one FeedInfo record")
        source_date = feed[0]["FeedStartDate"][:10]
    hierarchy = {
        key: {"station_id": key, "station_name": row["Name"], "fare_zones": row["FareZones"], "hub_naptan_code": row["HubNaptanCode"], "platforms": []}
        for key, row in stations.items()
    }
    platform_index = {}
    for key, row in platforms.items():
        if row["StationUniqueId"] not in hierarchy:
            raise ValueError(f"Broken station/platform join for {key}")
        if row["IsCustomerFacing"].upper() not in ("TRUE", "FALSE"):
            raise ValueError(f"Invalid IsCustomerFacing for {key}")
        platform = {
            "platform_id": key, "platform_number": row["PlatformNumber"],
            "friendly_name": row["FriendlyName"], "cardinal_direction": row["CardinalDirection"],
            "platform_naptan_code": row["PlatformNaptanCode"],
            "is_customer_facing": row["IsCustomerFacing"].upper() == "TRUE", "services": [],
        }
        hierarchy[row["StationUniqueId"]]["platforms"].append(platform)
        platform_index[key] = platform
    for row in services:
        key, line = row["PlatformUniqueId"], row["Line"]
        if key not in platform_index:
            raise ValueError(f"Broken platform/service join for {key}")
        if line not in lines or line not in modes or modes[line]["Mode"] != lines[line][1]:
            raise ValueError(f"Unknown or inconsistent source line {line}")
        platform_index[key]["services"].append({
            "line_id": line, "line_name": lines[line][0], "mode": modes[line]["Mode"],
            "direction_towards": row["DirectionTowards"], "stop_area_naptan_code": row["StopAreaNaptanCode"],
        })
    ordered = sorted(hierarchy.values(), key=lambda station: (station["station_name"].casefold(), station["station_id"]))
    for station in ordered:
        station["platforms"].sort(key=lambda platform: platform["platform_id"])
        for platform in station["platforms"]:
            platform["services"].sort(key=lambda service: (service["line_id"], service["direction_towards"], service["stop_area_naptan_code"]))
    return {
        "metadata": {
            "source_url": SOURCE_URL, "specification_url": SPECIFICATION_URL,
            "retrieved_on": retrieved_on, "archive_internal_file_date": source_date,
            "source_sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
            "station_count": len(stations), "platform_count": len(platforms), "platform_service_count": len(services),
            "blank_platform_number_count": sum(not row["PlatformNumber"] for row in platforms.values()),
            "non_customer_facing_platform_count": sum(row["IsCustomerFacing"].upper() == "FALSE" for row in platforms.values()),
            "scope": "Complete extraction of the official TfL station topology archive, including partial National Rail and cable-car records. Blank source values remain empty strings. Canonical identifiers are preserved verbatim. Lines come from PlatformServices.Line. App eligibility is derived separately per customer-facing TfL-serving platform.",
        },
        "stations": ordered,
    }


def review_rows(snapshot):
    """Derive the workbook views and one-row-per-service CSV representation.

    Parameters
    ----------
    snapshot : dict
        Complete validated catalogue hierarchy.

    Returns
    -------
    list of tuple
        Sheet names, headers and data rows in publication order.
    """
    station_rows, platform_rows, service_rows = [], [], []
    for station in snapshot["stations"]:
        station_rows.append([
            station["station_name"], station["station_id"], station["fare_zones"],
            station["hub_naptan_code"], len(station["platforms"]),
        ])
        for platform in station["platforms"]:
            platform_rows.append([
                station["station_name"], platform["platform_number"],
                platform["friendly_name"], platform["cardinal_direction"],
                platform["is_customer_facing"], station["station_id"],
                platform["platform_id"], platform["platform_naptan_code"],
                " | ".join(service["line_name"] for service in platform["services"]),
            ])
            for service in platform["services"]:
                service_rows.append([
                    station["station_name"], platform["platform_number"],
                    service["line_name"], service["mode"],
                    platform["cardinal_direction"], service["direction_towards"],
                    platform["friendly_name"], str(platform["is_customer_facing"]),
                    service["line_id"], station["station_id"], platform["platform_id"],
                    platform["platform_naptan_code"], service["stop_area_naptan_code"],
                ])
    return [
        ("Platforms", ["Station", "Platform number", "Platform name", "Platform direction", "Customer facing", "Station ID", "Platform ID", "Platform NaPTAN", "Lines"], platform_rows),
        ("Platform services", CSV_FIELDS, service_rows),
        ("Stations", ["Station", "Station ID", "Fare zones", "Hub NaPTAN", "Platform count"], station_rows),
    ]


def write_workbook(path, sheets, metadata):
    """Write an OOXML review workbook with text-safe source identifiers.

    Parameters
    ----------
    path : pathlib.Path
        Staged workbook destination.
    sheets : list of tuple
        Sheet names, headers and data rows.
    metadata : dict
        Source provenance displayed on each sheet.

    Raises
    ------
    OSError
        If the staged workbook cannot be written.
    """
    def xml_bytes(element):
        return ET.tostring(element, encoding="utf-8", xml_declaration=True)

    def q(tag):
        return f"{{{NS}}}{tag}"

    content_ns = "http://schemas.openxmlformats.org/package/2006/content-types"
    rel_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
    doc_rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    content = ET.Element("Types", xmlns=content_ns)
    ET.SubElement(content, "Default", Extension="rels", ContentType="application/vnd.openxmlformats-package.relationships+xml")
    ET.SubElement(content, "Default", Extension="xml", ContentType="application/xml")
    ET.SubElement(content, "Override", PartName="/xl/workbook.xml", ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml")
    workbook = ET.Element(q("workbook"))
    sheet_list = ET.SubElement(workbook, q("sheets"))
    relationships = ET.Element("Relationships", xmlns=rel_ns)
    root_relationships = ET.Element("Relationships", xmlns=rel_ns)
    ET.SubElement(root_relationships, "Relationship", Id="rId1", Type=f"{doc_rel}/officeDocument", Target="xl/workbook.xml")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as output:
        for index, (name, headers, rows) in enumerate(sheets, 1):
            ET.SubElement(sheet_list, q("sheet"), {"name": name, "sheetId": str(index), f"{{{doc_rel}}}id": f"rId{index}"})
            ET.SubElement(relationships, "Relationship", Id=f"rId{index}", Type=f"{doc_rel}/worksheet", Target=f"worksheets/sheet{index}.xml")
            ET.SubElement(content, "Override", PartName=f"/xl/worksheets/sheet{index}.xml", ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml")
            sheet = ET.Element(q("worksheet"))
            views = ET.SubElement(sheet, q("sheetViews"))
            view = ET.SubElement(views, q("sheetView"), workbookViewId="0")
            ET.SubElement(view, q("pane"), ySplit="7", topLeftCell="A8", activePane="bottomLeft", state="frozen")
            columns = ET.SubElement(sheet, q("cols"))
            for column in range(1, len(headers) + 1):
                ET.SubElement(columns, q("col"), min=str(column), max=str(column), width="32", customWidth="1")
            data = ET.SubElement(sheet, q("sheetData"))
            preamble = [[f"TfL {name.lower()}"], [f"{len(rows)} records. Source date {metadata['archive_internal_file_date']}. Retrieved {metadata['retrieved_on']}."], [SOURCE_URL], [f"Source SHA-256 {metadata['source_sha256']}"], ["Blank source fields are unknown. Includes full source coverage."], [], headers]
            for row_number, values in enumerate(preamble + rows, 1):
                row = ET.SubElement(data, q("row"), r=str(row_number))
                for column, value in enumerate(values):
                    letter = chr(65 + column)
                    cell = ET.SubElement(row, q("c"), r=f"{letter}{row_number}", t="inlineStr")
                    text = ET.SubElement(ET.SubElement(cell, q("is")), q("t"), {"{http://www.w3.org/XML/1998/namespace}space": "preserve"})
                    text.text = str(value)
            ET.SubElement(sheet, q("autoFilter"), ref=f"A7:{chr(64 + len(headers))}{len(rows) + 7}")
            output.writestr(f"xl/worksheets/sheet{index}.xml", xml_bytes(sheet))
        output.writestr("[Content_Types].xml", xml_bytes(content))
        output.writestr("_rels/.rels", xml_bytes(root_relationships))
        output.writestr("xl/workbook.xml", xml_bytes(workbook))
        output.writestr("xl/_rels/workbook.xml.rels", xml_bytes(relationships))


def build_bundle(snapshot, directory):
    """Stage all formats and verify full cell/row equality before publication.

    Parameters
    ----------
    snapshot : dict
        Complete source hierarchy to validate and export.
    directory : pathlib.Path
        Dedicated staging directory.

    Raises
    ------
    subprocess.CalledProcessError
        If shared snapshot validation fails.
    ValueError
        If exported CSV or workbook cells disagree with the snapshot.
    OSError
        If staged files cannot be written or reopened.
    """
    json_path = directory / f"{BASENAME}.json"
    json_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    node_boundary("validate", str(json_path))
    sheets = review_rows(snapshot)
    csv_path = directory / f"{BASENAME}.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(CSV_FIELDS)
        writer.writerows(sheets[1][2])
    with csv_path.open(encoding="utf-8-sig", newline="") as stream:
        if list(csv.reader(stream)) != [CSV_FIELDS] + sheets[1][2]:
            raise ValueError("CSV representation disagrees with JSON")
    workbook_path = directory / f"{BASENAME}.xlsx"
    write_workbook(workbook_path, sheets, snapshot["metadata"])
    with zipfile.ZipFile(workbook_path) as workbook:
        if workbook.testzip():
            raise ValueError("Invalid workbook archive")
        for index, (_name, headers, expected) in enumerate(sheets, 1):
            xml = ET.fromstring(workbook.read(f"xl/worksheets/sheet{index}.xml"))
            actual = [[cell.find(f"{{{NS}}}is/{{{NS}}}t").text or "" for cell in row] for row in xml.findall(f"{{{NS}}}sheetData/{{{NS}}}row") if int(row.attrib["r"]) >= 7]
            if actual != [[str(value) for value in row] for row in [headers] + expected]:
                raise ValueError("Workbook representation disagrees with JSON")


def publish_bundle(staged, destination):
    """Replace one complete directory, restoring the previous bundle on failure.

    Parameters
    ----------
    staged : pathlib.Path
        Fully validated replacement directory on the same filesystem.
    destination : pathlib.Path
        Dedicated catalogue bundle directory.

    Raises
    ------
    FileExistsError
        If a backup from an interrupted refresh requires recovery.
    ValueError
        If the destination contains unrelated files.
    OSError
        If publication or rollback fails. A failed rollback preserves its backup.
    """
    backup = destination.parent / f".{destination.name}.previous"
    if backup.exists():
        raise FileExistsError(f"Recover the previous interrupted refresh first: {backup}")
    if destination.exists():
        expected = {f"{BASENAME}.{suffix}" for suffix in ("json", "csv", "xlsx")}
        if {path.name for path in destination.iterdir()} - expected:
            raise ValueError("Output directory contains files outside the catalogue bundle")
        destination.rename(backup)
    try:
        staged.rename(destination)
    except OSError:
        if backup.exists():
            backup.rename(destination)
        raise
    if backup.exists():
        shutil.rmtree(backup)


def main():
    """Validate command-line provenance and publish a checked replacement bundle.

    Raises
    ------
    ValueError
        If the reviewed checksum or catalogue data is invalid.
    FileExistsError
        If another writer holds the exclusive refresh lock.
    OSError
        If source reads, staging, publication or rollback fails.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--sha256", required=True, help="Reviewed SHA-256 of the downloaded official archive")
    parser.add_argument("--retrieved-on", required=True, help="ISO retrieval date YYYY-MM-DD")
    parser.add_argument("--output", type=Path, default=ROOT / "data/tfl-station-platform-inventory")
    arguments = parser.parse_args()
    if hashlib.sha256(arguments.archive.read_bytes()).hexdigest() != arguments.sha256:
        raise ValueError("Source checksum does not match reviewed SHA-256")
    destination = arguments.output.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    lock = destination.parent / f".{destination.name}.refresh.lock"
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        os.close(descriptor)
        snapshot = extract_snapshot(arguments.archive, arguments.retrieved_on)
        with tempfile.TemporaryDirectory(prefix=".catalogue-refresh-", dir=destination.parent) as temporary:
            staged = Path(temporary) / "next"
            staged.mkdir()
            build_bundle(snapshot, staged)
            publish_bundle(staged, destination)
        print(json.dumps(snapshot["metadata"], indent=2))
    finally:
        lock.unlink()


if __name__ == "__main__":
    main()
