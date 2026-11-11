#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fail if the tracked tree grows past its budget.

Run output, receipts, review packets and built sites belong in workflow
artifacts or releases, not in git. This guard keeps them out:

* any tracked file larger than 1 MiB must match a glob in .github/size-allowlist.txt
* the total size of tracked files must stay under TOTAL_BUDGET_MB
"""
import fnmatch
import subprocess
import sys
from pathlib import Path

FILE_LIMIT = 1024 * 1024
FORBIDDEN_PREFIXES = (
    "docs/helix/04-build/evidence/",
    "docs/helix/05-deploy/microsite/dist/",
    "out/",
)
TOTAL_BUDGET_MB = 600


def tracked(root):
    out = subprocess.run(["git", "ls-files", "-s", "-z"], cwd=root, check=True, capture_output=True).stdout
    paths = []
    for entry in out.split(b"\0"):
        if not entry:
            continue
        meta, path = entry.split(b"\t", 1)
        if meta.startswith(b"160000"):  # submodule
            continue
        paths.append((meta.split()[1].decode(), path.decode()))
    return paths


def sizes(root, paths):
    request = "".join(oid + "\n" for oid, _ in paths).encode()
    out = subprocess.run(
        ["git", "cat-file", "--batch-check=%(objectname) %(objectsize)"],
        cwd=root, check=True, capture_output=True, input=request,
    ).stdout.decode().splitlines()
    return [int(line.split()[1]) for line in out]


def main():
    root = Path(__file__).resolve().parents[1]
    allow = [
        line.strip()
        for line in (root / ".github/size-allowlist.txt").read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]
    paths = tracked(root)
    total = 0
    failures = []
    for (_, path), size in zip(paths, sizes(root, paths)):
        total += size
        if path.startswith(FORBIDDEN_PREFIXES):
            failures.append(f"{path}: generated output must not be tracked (use a CI artifact or release asset)")
        if size > FILE_LIMIT and not any(fnmatch.fnmatchcase(path, pattern) for pattern in allow):
            failures.append(f"{path}: {size / 1048576:.1f} MiB exceeds 1 MiB and is not in .github/size-allowlist.txt")
    if total > TOTAL_BUDGET_MB * 1048576:
        failures.append(f"tracked tree is {total / 1048576:.0f} MiB, budget is {TOTAL_BUDGET_MB} MiB")
    print(f"{len(paths)} tracked files, {total / 1048576:.0f} MiB (budget {TOTAL_BUDGET_MB} MiB)")
    for failure in failures:
        print("FAIL " + failure)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
