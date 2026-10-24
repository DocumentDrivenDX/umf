#!/usr/bin/env python3
"""Check or explicitly refresh the nine-resource action-runtime manifest."""
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[3]
HELPER = ROOT / "python/src/umf/_action_runtime_manifest.py"
SPEC = importlib.util.spec_from_file_location("umf_action_runtime_manifest", HELPER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Cannot load the action runtime manifest helper")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="refresh manifest and digest pin from spec/")
    mode.add_argument("--check", action="store_true", help="verify manifest and digest pin against spec/")
    args = parser.parse_args()
    try:
        if args.write:
            pin = MODULE.sync(ROOT, ROOT / "python")
            print(f"action-runtime resource manifest refreshed: sha256={pin}")
        MODULE.check(ROOT, ROOT / "python")
    except (OSError, ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print("action-runtime resource manifest current: 9 canonical resources")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
