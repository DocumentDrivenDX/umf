#!/usr/bin/env python3
"""Compare all Python datetime.date values with retained TS and Rust kernels."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import platform
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
TS_RUNNER = ROOT / "scripts/rust-migration/r5/gregorian_date_bun_oracle.ts"


def expected(token: str) -> str:
    value = dt.date.fromisoformat(token)
    return f"OK|{token}|{value.year}|{value.month}|{value.day}\n"


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def version(*command: str) -> str:
    return subprocess.run(command, check=True, text=True, capture_output=True).stdout.strip().splitlines()[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receipt", type=pathlib.Path)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="umf-gregorian-oracle-") as temporary:
        base = pathlib.Path(temporary)
        tokens_path, ts_path, rust_path = (base / name for name in ("tokens.txt", "typescript.txt", "rust.txt"))
        with tokens_path.open("w", encoding="ascii", newline="\n") as tokens:
            for year in range(1, 10_000):
                current, end = dt.date(year, 1, 1), dt.date(year, 12, 31)
                while current <= end:
                    tokens.write(current.isoformat() + "\n")
                    if current == end:
                        break
                    current += dt.timedelta(days=1)

        with tokens_path.open("rb") as source, ts_path.open("wb") as output:
            subprocess.run(["bun", str(TS_RUNNER)], cwd=ROOT, stdin=source, stdout=output, check=True)
        with tokens_path.open("rb") as source, rust_path.open("wb") as output:
            subprocess.run(
                ["cargo", "run", "--quiet", "-p", "umf-core", "--example", "gregorian_date_oracle"],
                cwd=ROOT, stdin=source, stdout=output, check=True
            )

        count, ts_hash, rust_hash = 0, hashlib.sha256(), hashlib.sha256()
        with (tokens_path.open(encoding="ascii") as tokens, ts_path.open("rb") as ts,
              rust_path.open("rb") as rust):
            for raw_token in tokens:
                token = raw_token.rstrip("\n")
                ts_line, rust_line = ts.readline(), rust.readline()
                oracle_line = expected(token).encode("ascii")
                if ts_line != oracle_line:
                    raise SystemExit(f"TypeScript mismatch at {token}: {ts_line!r} != {oracle_line!r}")
                if rust_line != oracle_line:
                    raise SystemExit(f"Rust mismatch at {token}: {rust_line!r} != {oracle_line!r}")
                ts_hash.update(ts_line)
                rust_hash.update(rust_line)
                count += 1
            if ts.readline() or rust.readline():
                raise SystemExit("engine produced extra output")

    receipt = {
        "oracle": "Python datetime.date.fromisoformat and year/month/day enumeration",
        "range": {"first": "0001-01-01", "last": "9999-12-31", "inclusive": True},
        "valid_date_count": count,
        "typescript_bun_matches": count,
        "rust_matches": count,
        "typescript_output_sha256": ts_hash.hexdigest(),
        "rust_output_sha256": rust_hash.hexdigest(),
        "source_sha256": {
            "typescript_helper": sha256(ROOT / "src/adapters/gregorian-date.ts"),
            "rust_module": sha256(ROOT / "crates/umf-core/src/gregorian_date.rs"),
            "rust_matrix_driver": sha256(ROOT / "crates/umf-core/examples/gregorian_date_oracle.rs"),
            "bun_matrix_driver": sha256(TS_RUNNER),
            "python_oracle": sha256(pathlib.Path(__file__).resolve()),
        },
        "tools": {
            "python": platform.python_version(),
            "bun": version("bun", "--version"),
            "rustc": version("rustc", "--version"),
        },
        "independence_limit": "Valid civil-date matrix only; not authority for all UMF temporal semantics or bindings integration.",
    }
    encoded = json.dumps(receipt, indent=2) + "\n"
    if args.receipt:
        args.receipt.write_text(encoded, encoding="utf-8")
    print(encoded, end="")


if __name__ == "__main__":
    main()
