"""Verify ESLint stays within the current checkout during release checks."""

import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    ("path", "ignored"),
    [
        ("src/lib/tfl/client.ts", False),
        ("eslint.config.mjs", False),
        (".next/server/chunks/runtime.js", True),
        ("native/src/App.tsx", True),
        (".worktrees/mobile-first-roadmap/src/app/page.tsx", True),
        (".worktrees/mobile-first-roadmap/.next/server/chunks/runtime.js", True),
    ],
)
def test_eslint_limits_checks_to_current_checkout(path, ignored):
    """Keep app sources checked while excluding generated and separate checkouts."""
    result = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            "import { ESLint } from 'eslint';"
            "console.log(JSON.stringify(await new ESLint().isPathIgnored(process.argv[1])));",
            path,
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) is ignored
