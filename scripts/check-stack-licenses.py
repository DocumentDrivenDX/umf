# SPDX-License-Identifier: MIT OR Apache-2.0
"""Audit first-party source/package licensing and built wheel/SDK license payloads.

Run with Python 3.11+. Frozen evidence, third-party resources and generated
outputs retain separate custody and are intentionally outside header enforcement.
"""
from __future__ import annotations

import argparse
import email
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tomllib
import zipfile

EXPRESSION = "MIT OR Apache-2.0"
FILES = ("LICENSE.md", "LICENSE-MIT", "LICENSE-APACHE")
EXCLUDED = {
    "evidence", "vendor", "node_modules", "upstream", "notices", "third-party",
    "third_party", "generated", "fixtures", "conformance", "dist", "distributions",
    ".ddx", ".git", ".agents", ".codex", ".claude", "native", "spikes", "static",
    "owners", "_umf", "_umf_core08", "_umf_keys08", "_umf_keys", "_embedded_js",
    "_current_query_owner", "_current_disclosure_owner", "_preparation_sources",
    "_installation", "_source_census", "resources",
}
TOPS = {"src", "scripts", "tests", "test", "packages", "python", "crates", "ui", "examples", "website"}
SUFFIXES = {".py", ".sh", ".bash", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".rs", ".c", ".h", ".sql", ".css"}


def audit_root(root: Path) -> dict[str, object]:
    paths = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root).decode().split("\0")
    headers = 0
    packages = []
    for name in FILES:
        assert (root / name).is_file(), f"Missing {root / name}"
    assert EXPRESSION in (root / "LICENSE.md").read_text()
    for name in sorted(set(paths) - {""}):
        rel = Path(name)
        if set(rel.parts) & EXCLUDED:
            continue
        path = root / rel
        if not path.is_file() or path.is_symlink():
            continue
        if rel.name == "pyproject.toml":
            project = tomllib.loads(path.read_text()).get("project")
            if not project:
                continue
            assert project["license"] == EXPRESSION, str(path)
            assert set(FILES) <= set(project["license-files"]), str(path)
            for license_file in FILES:
                assert (path.parent / license_file).read_bytes() == (root / license_file).read_bytes(), str(path)
            packages.append(name)
        elif rel.name == "package.json":
            data = json.loads(path.read_text())
            if "name" in data and any(k in data for k in ("scripts", "exports", "dependencies")):
                assert data["license"].strip("()") == EXPRESSION, str(path)
                packages.append(name)
        elif rel.suffix in SUFFIXES and rel.parts[0] in TOPS:
            if any(p.startswith(("_umf", "_current_")) for p in rel.parts):
                continue
            text = path.read_text()
            if re.search(r"@generated|DO NOT EDIT|auto-generated|automatically generated", text[:600], re.I):
                continue
            assert f"SPDX-License-Identifier: {EXPRESSION}" in text[:2048], str(path)
            headers += 1
    return {"root": str(root), "headers": headers, "packages": packages}


def audit_wheel(path: Path) -> dict[str, object]:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        metadata = email.message_from_bytes(archive.read(next(n for n in names if n.endswith(".dist-info/METADATA"))))
        assert metadata["License-Expression"] == EXPRESSION, str(path)
        declared = metadata.get_all("License-File", [])
        assert set(FILES) <= set(declared), str(path)
        for name in FILES:
            payload = archive.read(next(n for n in names if n.endswith(".dist-info/licenses/" + name)))
            assert len(payload) > 500, str(path)
        return {"wheel": path.name, "license": metadata["License-Expression"], "licenseFiles": declared}


def audit_sdk(path: Path) -> dict[str, object]:
    with tarfile.open(path) as archive:
        for name in FILES:
            payload = archive.extractfile("package/" + name)
            assert payload is not None and len(payload.read()) > 500, str(path)
        package = archive.extractfile("package/package.json")
        assert package is not None
        assert json.load(package)["license"] == EXPRESSION
    return {"sdk": str(path), "license": EXPRESSION, "licenseFiles": list(FILES)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", type=Path, nargs="*")
    parser.add_argument("--wheels", type=Path)
    parser.add_argument("--sdk", type=Path)
    args = parser.parse_args()
    results = [audit_root(p.resolve()) for p in args.roots]
    if args.wheels:
        wheels = sorted(args.wheels.glob("*.whl"))
        assert wheels, "No wheels to audit"
        results.extend(audit_wheel(p) for p in wheels)
    if args.sdk:
        results.append(audit_sdk(args.sdk))
    assert results, "Select at least one repository, wheel directory or SDK"
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
