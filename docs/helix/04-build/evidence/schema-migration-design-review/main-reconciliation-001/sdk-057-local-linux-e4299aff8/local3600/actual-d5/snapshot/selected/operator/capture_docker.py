#!/usr/bin/env python3
"""Run one local Docker command with bounded, hash-recorded stdout/stderr custody."""
import hashlib
import json
import os
import selectors
import signal
import subprocess
import sys
import time
from pathlib import Path

if len(sys.argv) < 5 or sys.argv[4] != "--":
    raise SystemExit("usage: capture_docker.py RECEIPT STDOUT_LOG STDERR_LOG -- COMMAND...")
receipt_path, stdout_path, stderr_path = map(Path, sys.argv[1:4])
command = sys.argv[5:]
cap = 131072
marker = b"\n[OUTER LOG TRUNCATED; full stream digest retained]\n"
payload_cap = cap - len(marker)
proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
sel = selectors.DefaultSelector()
streams = {}
capture_failed = False
for name, pipe, path in (("stdout", proc.stdout, stdout_path), ("stderr", proc.stderr, stderr_path)):
    try:
        handle = path.open("wb")
    except OSError:
        handle = None
        capture_failed = True
    streams[pipe.fileno()] = {"name": name, "pipe": pipe, "path": path, "handle": handle,
        "hash": hashlib.sha256(), "total": 0, "stored": 0, "truncated": False}
    sel.register(pipe, selectors.EVENT_READ, streams[pipe.fileno()])
start = time.monotonic()
termination_started = None
while sel.get_map():
    elapsed = time.monotonic() - start
    if proc.poll() is None and elapsed >= 3600 and termination_started is None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        termination_started = time.monotonic()
    if proc.poll() is None and termination_started is not None and time.monotonic() - termination_started >= 10:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        termination_started = float("inf")
    for key, _ in sel.select(timeout=0.25):
        entry = key.data
        chunk = entry["pipe"].read1(65536)
        if not chunk:
            sel.unregister(entry["pipe"])
            entry["pipe"].close()
            continue
        entry["hash"].update(chunk)
        entry["total"] += len(chunk)
        remaining = payload_cap - entry["stored"]
        if remaining > 0:
            saved = chunk[:remaining]
            if entry["handle"] is not None:
                try:
                    entry["handle"].write(saved)
                    entry["stored"] += len(saved)
                except OSError:
                    capture_failed = True
                    entry["handle"].close()
                    entry["handle"] = None
            else:
                capture_failed = True
        if len(chunk) > max(0, remaining):
            entry["truncated"] = True
        target = sys.stdout.buffer if entry["name"] == "stdout" else sys.stderr.buffer
        target.write(chunk)
        target.flush()
rc = proc.wait()
records = {}
for entry in streams.values():
    handle = entry["handle"]
    if handle is not None:
        try:
            if entry["truncated"]:
                handle.write(marker)
            handle.flush()
            os.fsync(handle.fileno())
            handle.close()
        except OSError:
            capture_failed = True
            try:
                handle.close()
            except OSError:
                pass
    try:
        stored_bytes = entry["path"].stat().st_size
        stored_hash = hashlib.sha256(entry["path"].read_bytes()).hexdigest()
    except OSError:
        stored_bytes = 0
        stored_hash = None
        capture_failed = True
    records[entry["name"]] = {"path": str(entry["path"]), "storedBytes": stored_bytes,
        "streamBytes": entry["total"], "streamSha256": entry["hash"].hexdigest(),
        "storedSha256": stored_hash, "truncated": entry["truncated"]}
receipt_path.write_text(json.dumps({"command": command, "exitCode": rc,
    "durationMs": round((time.monotonic() - start) * 1000), "perStreamCapBytes": cap,
    "captureFailed": capture_failed, "stdout": records["stdout"], "stderr": records["stderr"]},
    sort_keys=True, indent=2) + "\n")
if rc != 0:
    raise SystemExit(rc)
if capture_failed:
    raise SystemExit(74)
if any(record["truncated"] for record in records.values()):
    raise SystemExit(75)
