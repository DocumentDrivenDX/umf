# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed generate/check CLI. No executable discovery or external JS process."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import generate_python_client
from ._writer import check_package, write_package


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="umf-codegen", allow_abbrev=False)
    parser.add_argument("command", choices=("generate", "check"))
    parser.add_argument("--schema", required=True, type=Path)
    parser.add_argument("--package", required=True)
    parser.add_argument("--output", required=True, type=Path)
    argv = sys.argv[1:] if argv is None else argv
    for flag in ("--schema", "--package", "--output"):
        if sum(item.split("=", 1)[0] == flag for item in argv) > 1:
            parser.error("option may only appear once: " + flag)
    args = parser.parse_args(argv)
    try:
        result = generate_python_client(args.schema.read_bytes().decode("utf-8"), package=args.package,
                                        format="yaml" if args.schema.suffix.lower() in (".yaml", ".yml") else "json")
        if args.command == "check":
            differences = check_package(args.output, result)
            for path in differences:
                print(path, file=sys.stderr)
            return int(bool(differences))
        write_package(args.output, result)
        print(json.dumps({"package": args.package, "sourceDigest": result["sourceDigest"], "files": len(result["files"])}))
        return 0
    except Exception as error:  # Refuse locally; no executable or network fallback.
        response = {"code": getattr(error, "code", "GENERATION_FAILED"), "message": str(error)}
        for name in ("path", "written", "recovery"):
            value = getattr(error, name, None)
            if value is not None:
                response[name] = value
        print(json.dumps(response), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
