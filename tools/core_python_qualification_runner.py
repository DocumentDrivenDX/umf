# SPDX-License-Identifier: MIT OR Apache-2.0
"""Bounded command and artifact handling for the Core 0.10.3 wheel cohort."""

from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
import selectors
import signal
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

TOTAL_SECONDS = 1800
CLEANUP_RESERVE_SECONDS = 60
CHILD_SECONDS = 180
KILL_GRACE_SECONDS = 10
DRAIN_MARGIN_SECONDS = 2
LOG_BYTES = 1_048_576
ARTIFACT_BYTES = 16_777_216


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True, indent=2) + "\n", encoding="utf-8")


def seed(root: Path, total_seconds: int = TOTAL_SECONDS) -> None:
    root.mkdir(parents=True, exist_ok=True)
    started_utc = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    deadline = time.monotonic() + total_seconds
    _write_json(root / "deadline.json", {
        "profile": "umf.core-python-qualification-deadline/1",
        "startedMonotonic": time.monotonic(),
        "startedUtc": started_utc,
        "deadlineMonotonic": deadline,
        "totalSeconds": total_seconds,
        "cleanupReserveSeconds": CLEANUP_RESERVE_SECONDS,
        "timeoutKillGraceSeconds": KILL_GRACE_SECONDS,
        "drainMarginSeconds": DRAIN_MARGIN_SECONDS,
        "childSeconds": CHILD_SECONDS,
        "aggregateLogBytes": LOG_BYTES,
        "artifactBytes": ARTIFACT_BYTES,
    })
    _write_json(root / "failure-receipt.json", {
        "profile": "umf.core-python-qualification-run/1",
        "status": "failed_or_incomplete",
        "commands": [],
        "limits": {
            "totalSeconds": total_seconds,
            "cleanupReserveSeconds": CLEANUP_RESERVE_SECONDS,
            "timeoutKillGraceSeconds": KILL_GRACE_SECONDS,
            "drainMarginSeconds": DRAIN_MARGIN_SECONDS,
            "childSeconds": CHILD_SECONDS,
            "aggregateLogBytes": LOG_BYTES,
            "artifactBytes": ARTIFACT_BYTES,
        },
    })


def _regular_file(path: Path) -> os.stat_result:
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode):
        raise ValueError(f"Expected a regular non-symlink file: {path}")
    return metadata


def run(root: Path, name: str, maximum: int, argv: list[str]) -> int:
    deadline_row = json.loads((root / "deadline.json").read_text(encoding="utf-8"))
    now = time.monotonic()
    reserve = int(deadline_row["cleanupReserveSeconds"])
    grace = int(deadline_row["timeoutKillGraceSeconds"])
    drain_margin = int(deadline_row["drainMarginSeconds"])
    allowance = min(maximum, int(deadline_row["deadlineMonotonic"] - now - reserve - grace - drain_margin))
    if allowance <= 0 or not argv:
        raise SystemExit("Qualification deadline reserve reached or command is empty")
    records_path = root / "commands.json"
    records = json.loads(records_path.read_text(encoding="utf-8")) if records_path.is_file() else []
    used = sum(int(row.get("capturedBytes", 0)) for row in records)
    remaining_log = LOG_BYTES - used
    if remaining_log < 0:
        raise SystemExit("Aggregate qualification log cap was already exceeded")
    log_path = root / "logs" / f"{len(records) + 1:03d}-{name}.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    started_utc = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0, start_new_session=True)
    if process.stdout is None:
        raise RuntimeError("Could not open bounded command output")
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)
    captured = 0
    observed = 0
    overflow = False
    timed_out = False
    termination_sent: float | None = None
    drain_deadline: float | None = None
    process_group_kill_error: str | None = None
    orphaned_process_group = False

    def signal_group(number: int) -> None:
        nonlocal process_group_kill_error
        try:
            os.killpg(process.pid, number)
        except ProcessLookupError:
            pass
        except OSError as error:
            process_group_kill_error = error.__class__.__name__

    def group_exists() -> bool:
        try:
            os.killpg(process.pid, 0)
            return True
        except ProcessLookupError:
            return False
        except OSError as error:
            if error.errno == errno.EPERM:
                return True
            return False

    def stop_group(current: float) -> None:
        nonlocal termination_sent, drain_deadline
        if termination_sent is None:
            termination_sent = current
            drain_deadline = current + grace + drain_margin
            signal_group(signal.SIGTERM)

    with log_path.open("wb") as log:
        while True:
            current = time.monotonic()
            if current - started >= allowance and termination_sent is None:
                timed_out = True
                stop_group(current)
            if process.poll() is not None and group_exists() and termination_sent is None:
                orphaned_process_group = True
                stop_group(current)
            if termination_sent is not None and current - termination_sent >= grace:
                signal_group(signal.SIGKILL)
            ready = selector.select(0.1)
            for key, _mask in ready:
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                observed += len(chunk)
                room = remaining_log - captured
                if room > 0:
                    kept = chunk[:room]
                    log.write(kept)
                    captured += len(kept)
                if len(chunk) > max(room, 0):
                    overflow = True
                    stop_group(time.monotonic())
            if not selector.get_map():
                if process.poll() is not None:
                    if termination_sent is None or drain_deadline is None:
                        break
                    if time.monotonic() >= drain_deadline:
                        signal_group(signal.SIGKILL)
                        break
                    if not group_exists():
                        break
                    time.sleep(0.1)
                    continue
            if drain_deadline is not None and time.monotonic() >= drain_deadline:
                signal_group(signal.SIGKILL)
                selector.close()
                process.stdout.close()
                break
            if process.poll() is not None and not selector.get_map():
                break
        try:
            return_code = process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            timed_out = True
            signal_group(signal.SIGKILL)
            return_code = None
        finally:
            selector.close()
            if process.stdout and not process.stdout.closed:
                process.stdout.close()
    ended = time.monotonic()
    record = {
        "name": name,
        "argv": argv,
        "startedMonotonic": started,
        "endedMonotonic": ended,
        "startedUtc": started_utc,
        "endedUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "durationSeconds": round(ended - started, 6),
        "appliedAllowanceSeconds": allowance,
        "rawExitCode": return_code,
        "captureExitCode": 74 if overflow else 0,
        "timedOut": timed_out,
        "processGroupKillError": process_group_kill_error,
        "orphanedProcessGroup": orphaned_process_group,
        "overflow": overflow,
        "observedBytes": observed,
        "capturedBytes": captured,
        "logSha256": hashlib.sha256(log_path.read_bytes()).hexdigest(),
        "logPath": str(log_path),
    }
    records.append(record)
    _write_json(records_path, records)
    receipt_path = root / "failure-receipt.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8")) if receipt_path.is_file() else {}
    receipt["commands"] = records
    _write_json(receipt_path, receipt)
    if return_code != 0 or return_code is None or timed_out or overflow or orphaned_process_group or process_group_kill_error is not None:
        print(f"Bounded command failed; inspect {log_path}", file=sys.stderr)
        return return_code or 74
    return 0


def bundle(output: Path, sources: list[Path], maximum: int) -> None:
    rows: list[tuple[Path, int]] = []
    names: set[str] = set()
    total = 0
    for source in sources:
        metadata = _regular_file(source)
        if metadata.st_size > ARTIFACT_BYTES:
            raise ValueError(f"One artifact exceeds the fixed size bound: {source}")
        relative_name = f"{source.parent.name}/{source.name}"
        if relative_name in names:
            raise ValueError(f"Artifact family has duplicate relative names: {relative_name}")
        names.add(relative_name)
        total += metadata.st_size
        rows.append((source, metadata.st_size))
    if total > maximum:
        raise ValueError("Complete artifact family exceeds its fixed aggregate bound")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise ValueError("Bounded artifact output already exists")
    temporary = Path(tempfile.mkdtemp(prefix=f".{output.name}-", dir=output.parent))
    try:
        for source, expected_size in rows:
            destination = temporary / source.parent.name / source.name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            if destination.stat().st_size != expected_size:
                raise ValueError(f"Artifact changed while being staged: {source}")
        os.replace(temporary, output)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise


def fetch_locked(lock_path: Path, profile: str, cell: str, output: Path) -> list[Path]:
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    rows = [row for row in lock.get("wheels", []) if profile in row.get("profiles", []) and cell in row.get("cells", [])]
    if not rows or len({row.get("filename") for row in rows}) != len(rows):
        raise ValueError("Wheel lock has no unique selected closed set for this cell")
    total = sum(row.get("sizeBytes", 0) for row in rows)
    if any(type(row.get("sizeBytes")) is not int or row["sizeBytes"] <= 0 or row["sizeBytes"] > ARTIFACT_BYTES for row in rows) or total > ARTIFACT_BYTES:
        raise ValueError("Locked wheel acquisition exceeds the fixed aggregate bound")
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError("Locked wheel staging directory must be fresh and empty")
    staged: list[Path] = []
    for row in rows:
        filename = row.get("filename")
        url = row.get("url")
        digest = row.get("sha256")
        if not isinstance(filename, str) or Path(filename).name != filename or not isinstance(url, str) or not url.startswith("https://files.pythonhosted.org/") or not isinstance(digest, str) or len(digest) != 64:
            raise ValueError("Wheel lock row is incomplete or not from the pinned PyPI file host")
        destination = output / filename
        temporary = output / f".{filename}.part"
        hasher = hashlib.sha256()
        received = 0
        with urllib.request.urlopen(url, timeout=30) as response, temporary.open("xb") as sink:
            while True:
                chunk = response.read(min(65536, row["sizeBytes"] + 1 - received))
                if not chunk:
                    break
                received += len(chunk)
                if received > row["sizeBytes"]:
                    raise ValueError(f"Locked wheel exceeds its exact byte size: {filename}")
                hasher.update(chunk)
                sink.write(chunk)
        if received != row["sizeBytes"] or hasher.hexdigest() != digest:
            temporary.unlink(missing_ok=True)
            raise ValueError(f"Locked wheel byte identity differs: {filename}")
        os.replace(temporary, destination)
        staged.append(destination)
    return staged


def main() -> int:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="operation", required=True)
    seed_parser = commands.add_parser("seed")
    seed_parser.add_argument("--root", type=Path, required=True)
    seed_parser.add_argument("--total-seconds", type=int, default=TOTAL_SECONDS)
    run_parser = commands.add_parser("run")
    run_parser.add_argument("--root", type=Path, required=True)
    run_parser.add_argument("--name", required=True)
    run_parser.add_argument("--maximum-seconds", type=int, default=CHILD_SECONDS)
    run_parser.add_argument("argv", nargs=argparse.REMAINDER)
    bundle_parser = commands.add_parser("bundle")
    bundle_parser.add_argument("--output", type=Path, required=True)
    bundle_parser.add_argument("--maximum-bytes", type=int, default=ARTIFACT_BYTES)
    bundle_parser.add_argument("files", nargs="+", type=Path)
    fetch_parser = commands.add_parser("fetch-wheels")
    fetch_parser.add_argument("--lock", type=Path, required=True)
    fetch_parser.add_argument("--profile", required=True)
    fetch_parser.add_argument("--cell", required=True)
    fetch_parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.operation == "seed":
        if args.total_seconds not in {1200, 1800}:
            raise SystemExit("Only the reviewed 1200-second cell and 1800-second producer budgets are allowed")
        seed(args.root, args.total_seconds)
        return 0
    if args.operation == "run":
        argv = args.argv[1:] if args.argv[:1] == ["--"] else args.argv
        return run(args.root, args.name, args.maximum_seconds, argv)
    if args.operation == "fetch-wheels":
        fetch_locked(args.lock, args.profile, args.cell, args.output)
        return 0
    bundle(args.output, args.files, args.maximum_bytes)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
