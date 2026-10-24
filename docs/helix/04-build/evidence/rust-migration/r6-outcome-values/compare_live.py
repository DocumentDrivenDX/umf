#!/usr/bin/env python3
"""Compare the current Rust-backed receipt path to its frozen Python predecessor."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import sysconfig

import capture


def load_live_outcome():
    path = capture.ROOT / "python/umf_access/src/umf_access/unified/outcome_values.py"
    spec = importlib.util.spec_from_file_location(
        "umf_access.unified.outcome_live", path
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load live outcome_values.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main() -> None:
    installed_umf = sysconfig.get_paths().get("purelib")
    if installed_umf:
        extension_package = str(Path(installed_umf) / "umf")
        package_paths = sys.modules["umf"].__path__
        if extension_package not in package_paths:
            package_paths.insert(0, extension_package)
    frozen = capture.capture()
    capture.outcome = load_live_outcome()
    live = capture.capture()
    compared = (
        "hashes",
        "slotKeyControls",
        "payloadBoundary",
        "refusalMatrix",
        "sourceCallOrder",
    )
    differences = [name for name in compared if live[name] != frozen[name]]
    if differences:
        raise SystemExit("live receipt outcomes differ from frozen predecessor: " + ", ".join(differences))
    if len(frozen["refusalMatrix"]) != 17 or len(frozen["slotKeyControls"]) != 8:
        raise SystemExit("unexpected frozen matrix size")
    print(json.dumps({
        "status": "pass",
        "compared": list(compared),
        "refusalCases": len(frozen["refusalMatrix"]),
        "slotControls": len(frozen["slotKeyControls"]),
        "loadedRustExtension": live["runtime"]["loadedRustExtension"],
    }, sort_keys=True))


if __name__ == "__main__":
    main()
