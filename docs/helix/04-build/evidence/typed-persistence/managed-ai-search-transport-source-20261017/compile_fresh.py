"""Fresh actual-source publicCLI compilation after genuine native UUID observation."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import time
from pathlib import Path

from transport import Refused, canonical_uuid

PYTHON = Path("/private/tmp/sdk-r26-r22-314-env/bin/python")
CLI = PYTHON.parent / "umf-access"
BUN = Path("/private/tmp/sdk-bun142-recovered/bun")
REPO = Path("/Users/erik/.codex/worktrees/typed-sdk-recovery/umf")
INPUTS = (
    REPO
    / "docs/helix/04-build/evidence/typed-persistence/managed-ai-search-offline-20261017"
)


def verify_sources():
    report = json.loads((INPUTS / "stage-one-source-manifest.json").read_text())
    for name, expected in report["sourceFiles"].items():
        if hashlib.sha256((REPO / name).read_bytes()).hexdigest() != expected:
            raise Refused("original generator source changed: " + name)
    report = json.loads((INPUTS / "installed-49-proof.json").read_text())
    site = PYTHON.parent.parent / "lib/python3.14/site-packages"
    for name, expected in report["payloads"].items():
        if hashlib.sha256((site / name).read_bytes()).hexdigest() != expected:
            raise Refused("immutable compiler/runtime payload changed: " + name)


def compile_fresh(table_uuid, platform_version, out, *, deadline):
    canonical_uuid(table_uuid)
    if (
        type(platform_version) is not str
        or not platform_version
        or platform_version == "OFFLINE-NOT-NATIVE"
    ):
        raise Refused("actual observed platform required")
    verify_sources()
    out = Path(out)
    if out.exists():
        raise Refused("fresh compile output required")
    spec = importlib.util.spec_from_file_location(
        "owned_prepare", INPUTS / "prepare.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.prepare(out, table_uuid, platform_version)
    commands = [
        [
            str(BUN),
            "scripts/generate-access-search-fixture.ts",
            str(out),
            "--model",
            str(out / "model.json"),
            "--binding",
            str(out / "binding.json"),
            "--binding-id",
            "uc-search-binding",
        ],
        [str(CLI), "catalog", "--root", str(out), "--config", str(out / "config.json")],
        [
            str(CLI),
            "catalog",
            "--root",
            str(out),
            "--config",
            str(out / "config.json"),
            "--check",
        ],
    ]
    for i, command in enumerate(commands):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("fresh original compile deadline")
        result = subprocess.run(
            command,
            cwd=REPO,
            capture_output=True,
            timeout=min(60, remaining),
            check=False,
        )
        (out / f"compile-{i}.stdout").write_bytes(result.stdout)
        (out / f"compile-{i}.stderr").write_bytes(result.stderr)
        if result.returncode:
            raise Refused("original public compilation refused")
    verify_sources()
    return out
