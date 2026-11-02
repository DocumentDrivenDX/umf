#!/usr/bin/env python3
"""Check migration ownership boundaries and reject V8 in Python packages."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
try:
    import tomllib
except ModuleNotFoundError:
    from pip._vendor import tomli as tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = Path(os.environ.get(
    "UMF_RUST_BOUNDARY_REPORT",
    Path(tempfile.gettempdir()) / "umf-rust-boundary-current.json",
))
PRODUCTION_PACKAGES = ("umf-core", "umf-core-wire", "umf-metamodel", "umf-codegen", "umf-graphql")
PRODUCTION_SOURCE_FOLDERS = tuple(f"crates/{package}/src" for package in PRODUCTION_PACKAGES)

CORE_HOST_CRATES = {
    "pyo3", "napi", "napi-derive", "wasm-bindgen", "wasm-bindgen-futures", "js-sys", "web-sys",
    "v8", "rusty_v8", "deno_core", "rquickjs", "quick-js", "boa_engine",
    "clap", "tokio", "async-std", "reqwest", "ureq", "hyper", "axum", "actix-web", "std_fs",
}
CORE_HOST_MODULES = re.compile(r"\b(?:std::(?:fs|net|process|thread|time|env)|tokio::|async_std::|reqwest::|ureq::|napi::|pyo3::|wasm_bindgen::|web_sys::|js_sys::)")
FORBIDDEN_PY_IMPORTS = re.compile(r"(?m)^\s*(?:from\s+py_mini_racer\b|import\s+py_mini_racer\b|from\s+quickjs\b|import\s+quickjs\b)")
FORBIDDEN_TS_IMPORTS = re.compile(r"(?m)^\s*(?:import|export)\b[^\n]*?['\"](?:node:vm|node:v8|vm2|quickjs-emscripten|pyodide)['\"]")
RETIRED_CORE_RUNTIME_IMPORTS = re.compile(r"(?m)^\s*(?:from\s+(?:jsonschema|ruamel)(?:\.|\s)|import\s+(?:jsonschema|ruamel)(?:\.|\s|$))")
RUST_BINDING_FALLBACK = re.compile(r"""(?m)(?:from\s*|import\s*\()?["'](?:[^"']*/)?src/(?:validation|model|registry)/[^"']*["']""")
PRIVATE_CROSS_PACKAGE_IMPORT = re.compile(r"(?m)^\s*from\s+(umf|umf_access|umf_codegen)\._[A-Za-z0-9_.]*\s+import")
GENERATED_MARKER = re.compile(r"Generated (?:from|by)\s+[^\n]+", re.IGNORECASE)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def scan_text(path: str, source: str, *, allowed_debt: dict[str, dict[str, object]] | None = None) -> list[dict[str, object]]:
    findings = []
    allowed_debt = allowed_debt or {}
    kind_generic = path in {
        "crates/umf-core/src/kinds.rs", "src/model/extension-kinds.ts",
        "src/registry/kind-runtime.ts", "src/registry/registry.ts",
    }
    if kind_generic and re.search(r'''["'](?:umf\.)?(?:dashboard|lakeview)["']''', source):
        findings.append({"rule": "ecosystem-kind-in-generic-core", "path": path,
                         "message": "Generic kind code contains an ecosystem-specific discriminator"})
    if kind_generic and re.search(r'''(?:from\s*["'][^"']*(?:adapters|extensions)/|crate::adapters)''', source):
        findings.append({"rule": "kind-core-adapter-import", "path": path,
                         "message": "Generic kind code imports ecosystem implementation"})
    if (path.startswith("bindings/core/") or path in {"python/src/umf/registry.py", "python/src/umf/validation.py"}) and path.endswith((".js", ".ts", ".py")):
        if re.search(r"\b(?:if|switch|match)\b[^\n]*(?:payload\.kind|payload\[['\"]kind['\"]\])", source):
            findings.append({"rule": "kind-semantic-fork-in-wrapper", "path": path,
                             "message": "Binding contains payload kind interpretation"})
        if "const manifest =" in source and "'manifest', false)" in source and not re.search(r"return\s*\{\s*manifest\s*,\s*kinds\s*,", source):
            findings.append({"rule": "kind-manifest-transport-loss", "path": path,
                             "message": "Full-manifest registration does not forward its manifest and explicit kind opt-in"})
    saga_rust = path.startswith("crates/umf-codegen/src/actions/saga/")
    saga_wrapper = path in {"src/extensions/actions/saga.ts", "python/src/umf/saga.py"}
    if saga_rust and re.search(r"\b(?:std::(?:fs|net|process|thread|time|env)|tokio::|postgres::|sqlx::|reqwest::|pyo3::|napi::|wasm_bindgen::)", source):
        findings.append({"rule": "saga-host-capability", "path": path, "message": "Portable saga semantics import a host or native provider capability"})
    portable_saga_boundary = saga_rust or saga_wrapper or path.startswith(("bindings/core/", "crates/umf-core-wire/"))
    if portable_saga_boundary and re.search(r"(?:tests[/.]saga|(?:actions|saga)[_-]reference|psycopg|bun:sqlite)", source):
        findings.append({"rule": "saga-native-dependency", "path": path, "message": "Portable saga implementation depends on native reference consumer"})
    if saga_wrapper and re.search(r"\b(?:function|def)\s+(?:analyze|resolveMapping|compareParameter|settleTicket|advanceSaga)|\b(?:if|switch|match)\b[^\n]*(?:compensation\.kind|step\.action|mapping\.from)", source):
        findings.append({"rule": "saga-wrapper-semantic-fork", "path": path, "message": "Saga presentation wrapper contains semantic interpretation; shared Rust owns it"})
    is_engine_source = path.startswith("src/") or path.startswith("python/src/") or path.startswith("python/umf_access/src/") or path.startswith("python/umf_codegen/src/") or path.startswith("bindings/")
    if path.startswith("python/src/umf/") and path.endswith(".py") and RETIRED_CORE_RUNTIME_IMPORTS.search(source):
        findings.append({"rule": "retired-python-core-runtime", "path": path, "message": "Production Python core imports a retired schema/YAML semantic runtime"})
    # Binding tests compare against the independent TypeScript oracle. The
    # fallback prohibition applies to shipped binding code, not test fixtures.
    binding_test = re.match(r"^bindings/core/[^/]+/tests/", path) is not None
    if path.startswith("bindings/core/") and not binding_test and path.endswith((".ts", ".js", ".mjs")) and RUST_BINDING_FALLBACK.search(source):
        findings.append({"rule": "rust-binding-semantic-fallback", "path": path, "message": "Production Rust binding reaches the separate TypeScript reference semantic implementation"})
    if is_engine_source and FORBIDDEN_TS_IMPORTS.search(source):
        findings.append({"rule": "forbidden-javascript-engine-import", "path": path, "message": "UMF library source imports a JavaScript engine/runtime loader"})
    if is_engine_source and path.endswith(".py"):
        for match in FORBIDDEN_PY_IMPORTS.finditer(source):
            line = source.count("\n", 0, match.start()) + 1
            findings.append({"rule": "forbidden-python-javascript-engine", "path": path, "line": line, "message": "Python library imports an embedded JavaScript engine"})
    if is_engine_source:
        current_package = None
        parts = Path(path).parts
        if "src" in parts:
            index = parts.index("src")
            if len(parts) > index + 1:
                current_package = parts[index + 1]
        for match in PRIVATE_CROSS_PACKAGE_IMPORT.finditer(source):
            imported_package = match.group(1) + ("_access" if match.group(1) == "umf" and match.group(0).startswith("from umf_access") else "")
            import_line = source[match.start():source.find("\n", match.start()) if "\n" in source[match.start():] else len(source)].strip()
            native_binding_edge = (path == "python/umf_codegen/src/umf_codegen/_native.py"
                                   and import_line == "from umf._rust import _rust_core")
            if imported_package != current_package and not native_binding_edge:
                findings.append({"rule": "cross-package-private-import", "path": path, "line": source.count("\n", 0, match.start()) + 1, "message": f"Cross-package import reaches private module {match.group(0).strip()}"})
    return findings


def core_dependency_findings(names: set[str], path: str = "Cargo.toml") -> list[dict[str, object]]:
    return [{"rule": "host-dependency-in-rust-core-closure", "path": path, "crate": name,
             "message": f"Core dependency closure contains host/runtime crate {name}"}
            for name in sorted(names & CORE_HOST_CRATES)]


def fixture_manifest_dependencies(manifest: Path) -> set[str]:
    section = ""
    names = set()
    for line in manifest.read_text(encoding="utf-8").splitlines():
        header = re.match(r"\s*\[([^]]+)\]", line)
        if header:
            section = header.group(1)
        elif section == "dependencies":
            match = re.match(r"\s*([A-Za-z0-9_-]+)\s*=", line)
            if match:
                names.add(match.group(1))
    return names


def cargo_tree(cargo: str, platform: str, package: str, *, inverse: str | None = None, edges: str = "normal") -> dict[str, object]:
    command = [cargo, "--color", "never", "tree", "--locked", "--offline", "--target", platform, "-p", package, "--edges", edges]
    if inverse:
        command.extend(["-i", inverse])
    elif edges == "normal":
        command.extend(["--format", "{p}", "--prefix", "none"])
    env = os.environ.copy()
    env["PATH"] = str(Path(cargo).parent) + os.pathsep + env.get("PATH", "")
    # cargo tree is consumed by label parsers, so do not inherit CI's ANSI output.
    env["CARGO_TERM_COLOR"] = "never"
    proc = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, env=env)
    return {"status": "resolved" if proc.returncode == 0 else "error", "command": command,
            "stdout": proc.stdout, "stderr": proc.stderr.strip()}


def parse_cargo_tree_packages(source: str) -> set[str]:
    found = set()
    for line in source.splitlines():
        match = re.match(r"^([A-Za-z0-9_.+-]+) v([^\s]+)", line.strip())
        if match:
            found.add(f"{match.group(1)}@{match.group(2)}")
    return found


def check_production_core() -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    findings, reports = [], []
    cargo = shutil.which("cargo") or "/opt/homebrew/opt/rustup/bin/cargo"
    rustc = shutil.which("rustc") or "/opt/homebrew/opt/rustup/bin/rustc"
    info = subprocess.run([rustc, "-vV"], capture_output=True, text=True).stdout
    host = re.search(r"(?m)^host: (\S+)", info)
    for target in [host.group(1) if host else "x86_64-unknown-linux-gnu", "wasm32-unknown-unknown"]:
        for package in PRODUCTION_PACKAGES:
            result = cargo_tree(cargo, target, package)
            closure = parse_cargo_tree_packages(result["stdout"])
            names = {p.split("@", 1)[0] for p in closure}
            # Production core packages must remain free of host/runtime dependencies.
            forbidden = names & (CORE_HOST_CRATES | {"getrandom", "jsonschema", "ahash"})
            if result["status"] != "resolved" or forbidden:
                findings.append({"rule": "production-core-host-dependency", "path": "Cargo.toml", "target": target, "message": str(result["stderr"] or sorted(forbidden))})
            reports.append({"package": package, "target": target, "closure": sorted(closure), "status": "pass" if result["status"] == "resolved" and not forbidden else "fail"})
    for folder in PRODUCTION_SOURCE_FOLDERS:
        for path in sorted((ROOT / folder).rglob("*.rs")):
            source = path.read_text()
            findings.extend(scan_text(path.relative_to(ROOT).as_posix(), source))
            for match in CORE_HOST_MODULES.finditer(source):
                findings.append({"rule": "production-core-host-capability", "path": path.relative_to(ROOT).as_posix(), "message": match.group(0)})
    return findings, reports


def generated_provenance() -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    findings: list[dict[str, object]] = []
    records = []
    candidates = list((ROOT / "src/generated").rglob("*")) + list((ROOT / "python/umf_access/src/umf_access").glob("generated_*.py")) + list((ROOT / "python/umf_codegen/src/umf_codegen").glob("_release.py"))
    for path in sorted(p for p in candidates if p.is_file()):
        source = path.read_text(encoding="utf-8", errors="replace")
        marker = GENERATED_MARKER.search(source[:4096])
        record = {"path": path.relative_to(ROOT).as_posix(), "sha256": sha(path), "marker": marker.group(0).strip() if marker else None}
        records.append(record)
        if not marker:
            findings.append({"rule": "generated-file-missing-provenance", "path": record["path"], "message": "Generated output lacks a source/generator provenance marker"})
    return findings, records


def run(check_controls: bool = True) -> dict[str, object]:
    findings: list[dict[str, object]] = []
    codegen_manifest = ROOT / "python/umf_codegen/pyproject.toml"
    if codegen_manifest.is_file():
        dependencies = tomllib.loads(codegen_manifest.read_text(encoding="utf-8")).get("project", {}).get("dependencies", [])
        if any("mini-racer" in dependency.lower() or "py-mini-racer" in dependency.lower() for dependency in dependencies):
            findings.append({"rule": "forbidden-python-javascript-dependency", "path": "python/umf_codegen/pyproject.toml", "message": "Python codegen package depends on a JavaScript engine"})
    library_paths = []
    for folder in [ROOT / "src", ROOT / "python/src", ROOT / "python/umf_access/src", ROOT / "python/umf_codegen/src", ROOT / "bindings"]:
        if folder.exists():
            library_paths.extend(p for p in folder.rglob("*") if p.suffix in {".ts", ".tsx", ".js", ".mjs", ".cjs", ".py"})
    for path in sorted(library_paths):
        p = path.relative_to(ROOT).as_posix()
        findings.extend(scan_text(p, path.read_text(encoding="utf-8", errors="replace")))
    production_findings, production_reports = check_production_core()
    findings.extend(production_findings)
    provenance_findings, provenance = generated_provenance()
    findings.extend(provenance_findings)
    controls = {}
    if check_controls:
        with tempfile.TemporaryDirectory(prefix="umf-rust-boundary-fixture-") as temp:
            fixture_root = Path(temp)
            allowed_manifest = fixture_root / "allowed" / "Cargo.toml"
            forbidden_manifest = fixture_root / "forbidden" / "Cargo.toml"
            allowed_manifest.parent.mkdir()
            forbidden_manifest.parent.mkdir()
            allowed_manifest.write_text('[package]\nname="fixture-core"\nversion="0.1.0"\nedition="2024"\n[dependencies]\nserde="1"\n', encoding="utf-8")
            forbidden_manifest.write_text('[package]\nname="fixture-core"\nversion="0.1.0"\nedition="2024"\n[dependencies]\npyo3="0.26"\n', encoding="utf-8")
            allowed_names = fixture_manifest_dependencies(allowed_manifest)
            forbidden_names = fixture_manifest_dependencies(forbidden_manifest)
        controls = {"allowedPureRustDependency": "pass" if "serde" in allowed_names and not core_dependency_findings(allowed_names) else "fail",
                    "forbiddenHostDependency": "pass" if core_dependency_findings(forbidden_names) else "fail",
                    "formerV8BridgeImportRejected": "pass" if scan_text("python/umf_codegen/src/umf_codegen/_embedded.py", "from py_mini_racer import MiniRacer") else "fail",
                    "unscopedV8ImportRejected": "pass" if scan_text("python/umf_access/src/umf_access/fake.py", "import py_mini_racer") else "fail",
                    "privateCrossPackageImportRejected": "pass" if any(f["rule"] == "cross-package-private-import" for f in scan_text("python/src/umf/new.py", "from umf_access._internal import x")) else "fail",
                    "allowedRelativeImportAccepted": "pass" if not scan_text("src/model/new.ts", "import { x } from '../validation/index.js';") else "fail",
                    "temporaryManifestAllowedDependency": "pass" if not core_dependency_findings(allowed_names) else "fail",
                    "temporaryManifestForbiddenDependency": "pass" if core_dependency_findings(forbidden_names) else "fail",
                    "bindingSourceEngineImportRejected": "pass" if scan_text("bindings/core/node/index.js", "import vm from 'node:vm';") else "fail"}
    return {"schema": "umf.rust-boundary-check/0.1", "status": "pass" if not findings and all(v == "pass" for v in controls.values()) else "fail", "checkedSourceModules": len(library_paths),
            "productionCore": production_reports, "generatedProvenance": provenance, "negativeControls": controls, "findings": findings}


def main() -> int:
    if "--self-test" in sys.argv:
        result = run(check_controls=True)
        print(json.dumps(result, indent=2))
        return 0 if result["status"] == "pass" else 1
    result = run(check_controls=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], "checkedSourceModules": result["checkedSourceModules"], "productionCoreStatus": "pass" if all(r["status"] == "pass" for r in result["productionCore"]) else "fail", "negativeControls": result["negativeControls"], "findingCount": len(result["findings"])}))
    if result["findings"]:
        for finding in result["findings"]:
            print(f"{finding['rule']}: {finding.get('path')}: {finding['message']}", file=sys.stderr)
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
