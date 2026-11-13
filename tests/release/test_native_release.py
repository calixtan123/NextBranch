"""Regression tests for NextBranch native release configuration.

The tests load native/app.config.js through Node, the same entry point Expo and
EAS use, so they exercise the real release gate rather than a copy of it.
"""

import json
import os
import struct
import subprocess
import zlib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "native"
LOADER = (
    "const f=require('./app.config.js');"
    "console.log(JSON.stringify(f({config:require('./app.json').expo})))"
)


def load_config(**env: str) -> subprocess.CompletedProcess:
    """Evaluate app.config.js in a clean environment plus the given variables."""
    base = {k: v for k, v in os.environ.items() if not k.startswith(("EXPO_PUBLIC_", "NEXTBRANCH_"))}
    return subprocess.run(
        ["node", "-e", LOADER], cwd=NATIVE, env={**base, **env}, capture_output=True, text=True, timeout=30
    )


def release(url: str | None, **extra: str) -> subprocess.CompletedProcess:
    env = {"NEXTBRANCH_RELEASE_BUILD": "1", **extra}
    if url is not None:
        env["EXPO_PUBLIC_NEXTBRANCH_API_URL"] = url
    return load_config(**env)


@pytest.mark.parametrize(
    "url",
    [
        "https://8.8.8.8",
        "https://100.128.0.1",
        "https://api.nextbranch.app/",
        "https://API.nextbranch.app.:443",
        "https://api.nextbranch.app:8443/",
        "https://api.nextbranch.app:9",
    ],
)
def test_public_origin_variants_are_accepted_for_release(url):
    result = release(url)
    assert result.returncode == 0, result.stderr


def test_valid_https_origin_is_accepted_for_release():
    result = release("https://api.nextbranch.app")
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["ios"]["bundleIdentifier"] == "com.nextbranch.app"


def test_release_config_sets_icon():
    config = json.loads(release("https://api.nextbranch.app").stdout)
    assert config["icon"] == "./assets/icon.png"


def test_missing_url_is_rejected_for_release():
    result = release(None)
    assert result.returncode != 0
    assert "EXPO_PUBLIC_NEXTBRANCH_API_URL" in result.stderr


@pytest.mark.parametrize(
    "url",
    [
        "",
        "https://example.invalid",
        "https://api.example.com",
        "https://example.org",
        "https://nextbranch.test",
        "https://api.nextbranch.example",
        "https://localhost",
        "https://app.localhost",
        "https://printer.local",
        "https://127.0.0.1",
        "https://10.1.2.3",
        "https://172.16.0.5",
        "https://192.168.1.10",
        "https://169.254.1.1",
        "https://0.0.0.0",
        "https://[::1]",
        "https://[fd00::1]",
        "http://api.nextbranch.app",
        "https://api.nextbranch.app/v1",
        "https://user:pass@api.nextbranch.app",
        "https://api.nextbranch.app/?a=1",
        "https://api.nextbranch.app/#x",
        "not a url",
        # Documentation-only and shared address space IPv4 literals.
        "https://192.0.2.1",
        "https://198.51.100.1",
        "https://203.0.113.1",
        "https://100.64.0.1",
        "https://100.127.255.254",
        "https://198.18.0.1",
        "https://192.0.0.1",
        "https://224.0.0.1",
        "https://240.0.0.1",
        "https://255.255.255.255",
        # Raw text React Native's URL parser reads differently from Node's.
        "HTTPS://api.nextbranch.app",
        " https://api.nextbranch.app ",
        "https://api.nextbranch.app\n",
        "\thttps://api.nextbranch.app",
    ],
)
def test_unsafe_release_url_is_rejected(url):
    result = release(url)
    assert result.returncode != 0, url
    assert "EXPO_PUBLIC_NEXTBRANCH_API_URL" in result.stderr


@pytest.mark.parametrize(
    "url",
    [
        "https:///api.nextbranch.app",
        "https://api.nextbranch.app/v1/..",
        "https://api.nextbranch.app/%2e",
        "https://api.nextbranch.app?",
        "https://api.nextbranch.app#",
        "https://api.nextbranch.app//",
        "https://api.nextbranch.app\\",
        "https://@api.nextbranch.app",
        "https://api.nextbranch.app:",
        "https://api.nextbranch.app:65536",
        "https://localhost-api.nextbranch.app",
        "https://127.api.nextbranch.app",
    ],
)
def test_raw_release_origin_is_rejected(url):
    result = release(url)
    assert result.returncode != 0, url
    assert "EXPO_PUBLIC_NEXTBRANCH_API_URL" in result.stderr


@pytest.mark.parametrize(
    "fixture_env",
    [{"EXPO_PUBLIC_NEXTBRANCH_FIXTURE": "three-card-home"}, {"EXPO_PUBLIC_NEXTBRANCH_SEED": "1"}],
)
def test_fixture_settings_are_rejected_for_release(fixture_env):
    result = release("https://api.nextbranch.app", **fixture_env)
    assert result.returncode != 0
    assert "FIXTURE" in result.stderr or "SEED" in result.stderr


def test_ci_export_with_placeholder_url_still_loads():
    result = load_config(EXPO_PUBLIC_NEXTBRANCH_API_URL="https://example.invalid", CI="1")
    assert result.returncode == 0, result.stderr


def test_development_without_url_still_loads():
    assert load_config().returncode == 0


def test_eas_production_profile_is_store_ready():
    eas = json.loads((NATIVE / "eas.json").read_text())
    production = eas["build"]["production"]
    assert eas["cli"]["appVersionSource"] == "remote"
    assert production["autoIncrement"] is True
    assert production["environment"] == "production"
    assert production["env"]["NEXTBRANCH_RELEASE_BUILD"] == "1"
    assert "EXPO_PUBLIC_NEXTBRANCH_API_URL" not in production.get("env", {})


def test_app_icon_is_1024_square_without_alpha():
    data = (NATIVE / "assets" / "icon.png").read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    width, height, depth, color_type = struct.unpack(">IIBB", data[16:26])
    assert (width, height, depth) == (1024, 1024, 8)
    assert color_type == 2  # RGB: App Store Connect rejects icons with an alpha channel


def _png_image(data: bytes) -> tuple[tuple[int, int, int, int], bytes]:
    """Validate and decode the generator's unfiltered 8-bit RGB/RGBA PNGs."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "Invalid PNG signature"
    chunks = []
    offset = 8
    while offset < len(data):
        assert offset + 12 <= len(data), "Truncated PNG chunk"
        length = struct.unpack_from(">I", data, offset)[0]
        end = offset + 8 + length
        assert end + 4 <= len(data), "Truncated PNG chunk data"
        name = data[offset + 4:offset + 8]
        body = data[offset + 8:end]
        checksum = struct.unpack_from(">I", data, end)[0]
        assert zlib.crc32(name + body) == checksum, f"Invalid {name!r} CRC"
        chunks.append((name, body))
        offset = end + 4

    assert len(chunks) >= 3, "Missing PNG chunks"
    assert chunks[0][0] == b"IHDR" and chunks[-1] == (b"IEND", b"")
    assert all(name == b"IDAT" for name, _ in chunks[1:-1])
    assert len(chunks[0][1]) == 13, "Invalid IHDR length"
    width, height, depth, color_type, compression, filtering, interlace = struct.unpack(
        ">IIBBBBB", chunks[0][1]
    )
    assert width > 0 and height > 0
    assert depth == 8 and color_type in (2, 6), "Expected 8-bit RGB/RGBA"
    assert (compression, filtering, interlace) == (0, 0, 0)
    scanlines = zlib.decompress(b"".join(body for _, body in chunks[1:-1]))
    channels = {2: 3, 6: 4}[color_type]
    row_length = width * channels + 1
    assert len(scanlines) == height * row_length, "Invalid pixel data length"
    assert all(value == 0 for value in scanlines[::row_length]), "Expected filter 0"
    return (width, height, depth, color_type), scanlines


def _sample_png(pixel: bytes = b"\x17\x17\x17", compression_level: int = 6) -> bytes:
    """Build a valid single-pixel RGB PNG for comparison regressions."""
    chunks = [
        (b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)),
        (b"IDAT", zlib.compress(b"\x00" + pixel, level=compression_level)),
        (b"IEND", b""),
    ]
    return b"\x89PNG\r\n\x1a\n" + b"".join(
        struct.pack(">I", len(body)) + name + body + struct.pack(">I", zlib.crc32(name + body))
        for name, body in chunks
    )


def test_png_image_accepts_different_compression_streams():
    """Equivalent compressed encodings preserve the decoded image contract."""
    stored = _sample_png(compression_level=0)
    compressed = _sample_png(compression_level=9)
    assert stored != compressed
    assert _png_image(stored) == _png_image(compressed) == (
        (1, 1, 8, 2), b"\x00\x17\x17\x17"
    )


def test_png_image_detects_changed_pixel():
    """A single changed color channel remains visible to the comparison."""
    before = _sample_png()
    after = _sample_png(pixel=b"\x18\x17\x17")
    assert _png_image(before) != _png_image(after)
    assert _png_image(after) == ((1, 1, 8, 2), b"\x00\x18\x17\x17")


def test_png_image_rejects_corrupt_chunk():
    """Invalid PNG chunk checksums fail before comparing image content."""
    corrupted = bytearray(_sample_png())
    corrupted[-1] ^= 1
    with pytest.raises(AssertionError, match="CRC"):
        _png_image(bytes(corrupted))


def test_icon_generator_reproduces_committed_icons(tmp_path):
    """Regenerate into a temporary directory and compare every icon's content."""
    icons = [Path("native/assets/icon.png")]
    icons.extend(path.relative_to(ROOT) for path in (ROOT / "public" / "icons").glob("*.png"))
    committed = {path: _png_image((ROOT / path).read_bytes()) for path in icons}
    subprocess.run(
        ["node", str(ROOT / "scripts" / "generate-icons.mjs")],
        cwd=tmp_path,
        check=True,
        timeout=60,
    )
    generated = {
        path.relative_to(tmp_path): _png_image(path.read_bytes())
        for path in tmp_path.rglob("*.png")
    }
    # Compression may vary with zlib, while image format and pixels must match.
    assert generated == committed
