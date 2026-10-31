#!/usr/bin/env python3
"""Select saga/action qualification from an auditable path roster."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ROSTER = ROOT / "scripts/qualification/sagas-impact.json"


def changed_paths(base: str, head: str) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", "--no-renames", f"{base}...{head}"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return sorted({line.strip() for line in result.stdout.splitlines() if line.strip()})


def matches(path: str, group: dict[str, list[str]]) -> bool:
    return path in group["exact"] or any(path.startswith(prefix) for prefix in group["prefixes"])


def select(paths: list[str], roster: dict, force_all: bool = False) -> dict[str, bool]:
    if force_all or any(path in roster["alwaysAll"] for path in paths):
        return {"actions": True, "saga": True, "packages": True}
    return {
        name: any(matches(path, roster[name]) for path in paths)
        for name in ("actions", "saga", "packages")
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", help="base commit for a pull request")
    parser.add_argument("--head", help="head commit for a pull request")
    parser.add_argument("--all", action="store_true", help="select every qualification lane")
    parser.add_argument("--paths", nargs="*", help="test-only explicit changed paths")
    args = parser.parse_args()
    if args.paths is not None:
        paths = args.paths
    elif args.all:
        paths = []
    elif args.base and args.head:
        paths = changed_paths(args.base, args.head)
    else:
        parser.error("provide --all, --paths, or both --base and --head")

    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    selected = select(paths, roster, force_all=args.all)
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            for name, value in selected.items():
                handle.write(f"{name}={'true' if value else 'false'}\n")
    print(json.dumps({"paths": paths, **selected}, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
