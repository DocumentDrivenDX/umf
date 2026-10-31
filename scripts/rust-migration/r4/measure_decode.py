#!/usr/bin/env python3
"""Measure CPython JSON response parsing amplification for the R4 host limit.

This samples the non-preemptible ``json.loads`` interval. It is evidence of a
specific host/input shape, not a memory or time bound for arbitrary responses.
"""

import json
import platform
import resource
import subprocess
import sys
import time
from pathlib import Path


def child(size: int) -> None:
    payload = "[" + "0.1," * ((size - 6) // 4) + "0.1]"
    before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    start = time.monotonic()
    decoded = json.loads(payload)
    elapsed = time.monotonic() - start
    after = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    print(
        json.dumps(
            {
                "requestedBytes": size,
                "actualBytes": len(payload.encode("ascii")),
                "entries": len(decoded),
                "seconds": elapsed,
                "maxrssBeforeRaw": before,
                "maxrssAfterRaw": after,
            }
        )
    )


def main() -> None:
    if len(sys.argv) == 3 and sys.argv[1] == "--child":
        child(int(sys.argv[2]))
        return
    if len(sys.argv) != 1:
        raise SystemExit("usage: measure_decode.py")
    script = str(Path(__file__).resolve())
    runs = []
    for mib in (1, 4, 8, 16, 32):
        result = subprocess.run(
            [sys.executable, "-I", script, "--child", str(mib * 1024 * 1024)],
            capture_output=True,
            text=True,
            check=True,
        )
        runs.append(json.loads(result.stdout))
    print(
        json.dumps(
            {
                "schema": "umf.r4.python-json-decode-measurement/1",
                "host": {
                    "platform": platform.platform(),
                    "machine": platform.machine(),
                    "python": sys.version.split()[0],
                    "maxrssUnit": "bytes on macOS; KiB on Linux",
                },
                "sample": "array of JSON 0.1 floats; parse interval only",
                "qualification": "No hard Python-parent memory or parse-time bound follows from this sample.",
                "runs": runs,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
