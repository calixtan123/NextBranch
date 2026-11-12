"""Regression tests for NextBranch native release configuration.

The tests load native/app.config.js through Node, the same entry point Expo and
EAS use, so they exercise the real release gate rather than a copy of it.
"""

import json
import os
import struct
import subprocess
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


def test_icon_generator_reproduces_committed_icons():
    native_icon = NATIVE / "assets" / "icon.png"
    web_icons = sorted((ROOT / "public" / "icons").glob("*.png"))
    before = {path: path.read_bytes() for path in [native_icon, *web_icons]}
    subprocess.run(["node", "scripts/generate-icons.mjs"], cwd=ROOT, check=True, timeout=60)
    after = {path: path.read_bytes() for path in before}
    assert after == before  # native icon and existing web icons are byte-identical
