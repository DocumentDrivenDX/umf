#!/usr/bin/env python3
"""Replay the immutable compressed migration supplement with the shared R3 runner."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True)
    parser.add_argument("--root", default=".")
    parser.add_argument("--operation", action="append", default=[])
    parser.add_argument("--report", required=True)
    parser.add_argument("--timeout", type=float, default=180.0)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    evidence = root / "docs/helix/04-build/evidence/rust-migration/r3/supplement"
    receipt = json.loads((evidence / "receipt.json").read_text(encoding="utf-8"))
    fixture = (evidence / receipt["fixture"]["path"]).read_bytes()
    if sha256(fixture) != receipt["fixture"]["compressedSha256"]:
        raise SystemExit("compressed supplement hash does not match receipt")
    content = gzip.decompress(fixture)
    if len(content) != receipt["fixture"]["uncompressedBytes"] or sha256(content) != receipt["fixture"]["uncompressedSha256"]:
        raise SystemExit("decompressed supplement does not match receipt")
    decoded = json.loads(content)
    if decoded.get("format") != "umf-r3-migration-supplement/1" or len(decoded.get("cases", [])) != receipt["fixture"]["caseCount"]:
        raise SystemExit("supplement format or case count does not match receipt")

    runner = root / "scripts/rust-migration/r3/native-replay.py"
    with tempfile.NamedTemporaryFile(prefix="umf-r3-migration-supplement-", suffix=".json", delete=False) as handle:
        handle.write(content)
        materialized = Path(handle.name)
    command = [sys.executable, str(runner), "--binary", args.binary, "--root", str(root), "--fixture", str(materialized), "--report", args.report, "--timeout", str(args.timeout)]
    for operation in args.operation:
        command.extend(["--operation", operation])
    try:
        return subprocess.run(command, cwd=root, check=False).returncode
    finally:
        materialized.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
