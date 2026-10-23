#!/usr/bin/env python3
"""Compare the full 800-year Gregorian cycle with Bun and Rust instant kernels."""
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
TS_RUNNER = ROOT / "scripts/rust-migration/r5/rfc3339_exact_instant_bun_oracle.ts"
START = dt.date(1600, 1, 1)
END = dt.date(2400, 1, 1)
EPOCH = dt.datetime(1970, 1, 1)
FRACTIONS = ("", "0", "5", "5000", "12345678901234567890", "1000000", "00000100")
OFFSETS = ((0, "Z"), (1439, "+23:59"), (-1439, "-23:59"), (60, "+01:00"), (-60, "-01:00"), (0, "-00:00"))


def row(token: str, instant: dt.datetime, fraction: str, offset: str) -> bytes:
    delta = instant.replace(tzinfo=None) - EPOCH
    seconds = delta.days * 86_400 + delta.seconds
    return f"OK|{token}|{seconds}|{fraction.rstrip('0')}|{offset}|{str(offset != '-00:00').lower()}\n".encode("ascii")


def digest(path: pathlib.Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def version(*command: str) -> str:
    return subprocess.run(command, check=True, text=True, capture_output=True).stdout.strip().splitlines()[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receipt", type=pathlib.Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="umf-rfc3339-oracle-") as temporary:
        base = pathlib.Path(temporary)
        tokens_path, expected_path, ts_path, rust_path = (
            base / name for name in ("tokens.txt", "expected.txt", "typescript.txt", "rust.txt")
        )
        with tokens_path.open("w", encoding="ascii", newline="\n") as tokens, expected_path.open("wb") as expected:
            current, index = START, 0
            while current < END:
                offset_minutes, offset_text = OFFSETS[index % len(OFFSETS)]
                fraction = FRACTIONS[index % len(FRACTIONS)]
                hour, minute, second = (index * 17) % 24, (index * 29) % 60, (index * 43) % 60
                separator = "t" if index % 2 else "T"
                suffix = offset_text.lower() if offset_text == "Z" and index % 2 else offset_text
                token = f"{current:%Y-%m-%d}{separator}{hour:02d}:{minute:02d}:{second:02d}"
                if fraction:
                    token += "." + fraction
                token += suffix
                local = dt.datetime(current.year, current.month, current.day, hour, minute, second,
                                     tzinfo=dt.timezone(dt.timedelta(minutes=offset_minutes)))
                utc = local.astimezone(dt.timezone.utc)
                tokens.write(token + "\n")
                expected.write(row(token, utc, fraction, suffix))
                current += dt.timedelta(days=1)
                index += 1

        with tokens_path.open("rb") as source, ts_path.open("wb") as output:
            subprocess.run(["bun", str(TS_RUNNER)], cwd=ROOT, stdin=source, stdout=output, check=True)
        with tokens_path.open("rb") as source, rust_path.open("wb") as output:
            subprocess.run(["cargo", "run", "--quiet", "-p", "umf-core", "--example", "rfc3339_exact_instant_oracle"],
                           cwd=ROOT, stdin=source, stdout=output, check=True)

        count = 0
        with expected_path.open("rb") as oracle, ts_path.open("rb") as ts, rust_path.open("rb") as rust:
            while expected_row := oracle.readline():
                ts_row, rust_row = ts.readline(), rust.readline()
                if ts_row != expected_row:
                    raise SystemExit(f"TypeScript mismatch at matrix row {count}: {ts_row!r} != {expected_row!r}")
                if rust_row != expected_row:
                    raise SystemExit(f"Rust mismatch at matrix row {count}: {rust_row!r} != {expected_row!r}")
                count += 1
            if ts.readline() or rust.readline():
                raise SystemExit("engine produced extra output")
        expected_hash, ts_hash, rust_hash = digest(expected_path), digest(ts_path), digest(rust_path)

    receipt = {
        "oracle": "Python datetime.datetime with fixed datetime.timezone offsets; whole seconds derived using timedelta.days/seconds, never float timestamps",
        "range": {"first_date": START.isoformat(), "last_date": (END - dt.timedelta(days=1)).isoformat(), "inclusive": True},
        "gregorian_days_checked": count,
        "bun_exact_matches": count,
        "rust_exact_matches": count,
        "expected_output_sha256": expected_hash,
        "typescript_output_sha256": ts_hash,
        "rust_output_sha256": rust_hash,
        "source_sha256": {
            "typescript_helper": digest(ROOT / "src/adapters/rfc3339-exact-instant.ts"),
            "rust_module": digest(ROOT / "crates/umf-core/src/rfc3339_exact_instant.rs"),
            "rust_driver": digest(ROOT / "crates/umf-core/examples/rfc3339_exact_instant_oracle.rs"),
            "bun_driver": digest(TS_RUNNER),
            "python_oracle": digest(pathlib.Path(__file__).resolve()),
        },
        "tools": {"python": platform.python_version(), "bun": version("bun", "--version"), "rustc": version("rustc", "--version")},
        "subset": "All civil dates in the 1600–2399 inclusive 800-year span, with deterministic times, six offsets including -00:00, and seven fractional forms. Separate tests cover 0001/9999 normalization and the 1,048,576-unit token bound.",
        "independence_limit": "The matrix establishes this declared parser subset only; it does not qualify UMF core timestamps, storage precision, consumer adoption, bindings, or host equivalence.",
    }
    encoded = json.dumps(receipt, indent=2) + "\n"
    if args.receipt:
        args.receipt.write_text(encoded, encoding="utf-8")
    print(encoded, end="")


if __name__ == "__main__":
    main()
