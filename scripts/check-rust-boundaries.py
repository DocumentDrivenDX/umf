#!/usr/bin/env python3
"""Check migration ownership boundaries and the source-exact pre-R4 V8 debt."""
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
REPORT = ROOT / "docs/helix/04-build/evidence/rust-migration/r2/boundary-check.json"
V8_DEBT = {
    "python/umf_codegen/src/umf_codegen/_embedded.py": {
        "sha256": "06b2c4489d8b0e2068b518e920497b01f984c58ca08954017bfc932a61c9dd53",
        "reason": "Retained seven-operation Python V8 bridge after main PR41 added discover_changes and row_scope; all remain explicitly scoped R3/R4 debt, with R0 five-operation capture historical.",
        "patterns": ["py_mini_racer", "MiniRacer"],
    },
    "python/umf_codegen/pyproject.toml": {
        "sha256": "6fd91b3a8e5c381e41f2092a4de79669e09586bcb282582a8859586cbab35c36",
        "reason": "Pinned MiniRacer dependency remains pre-R4 debt; main PR40/41 changed only the package version through 0.1.0a4.",
        "patterns": ["mini-racer==0.14.1"],
    },
}
CORE_HOST_CRATES = {
    "pyo3", "napi", "napi-derive", "wasm-bindgen", "wasm-bindgen-futures", "js-sys", "web-sys",
    "v8", "rusty_v8", "deno_core", "rquickjs", "quick-js", "boa_engine",
    "clap", "tokio", "async-std", "reqwest", "ureq", "hyper", "axum", "actix-web", "std_fs",
}
WASM_R1_ENTROPY_EXCEPTION = {
    "target": "wasm32-unknown-unknown",
    "path": ["umf-rust-spike-core@0.1.0", "jsonschema@0.29.1", "ahash@0.8.12", "getrandom@0.3.4", "wasm-bindgen@0.2.100"],
    "incomingParents": {"getrandom@0.3.4", "js-sys@0.3.77", "umf-rust-spike-wasm@0.1.0"},
    "sourceHashes": {
        "Cargo.lock": "85d826771dc15de3e1f57562b2e8f041387789017581b7dcda7ffc0f20c08a58",
        "crates/rust-spike-core/Cargo.toml": "ae580f8c3ed0b339635b4b1050fb7ba613051f8a84a1f33d54a786b6053f4c7b",
        ".cargo/config.toml": "84fd4fa17fd967cae6006ba1b0dc430904239dec921c1441dd657387ee802d6c",
        "bindings/rust-spike/wasm/Cargo.toml": "c7eb4429fa2ad48eea56b23f134a639841aca535cf978096de2b4046e81a5a63",
    },
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
    is_engine_source = path.startswith("src/") or path.startswith("python/src/") or path.startswith("python/umf_access/src/") or path.startswith("python/umf_codegen/src/") or path.startswith("bindings/")
    if path.startswith("python/src/umf/") and path.endswith(".py") and RETIRED_CORE_RUNTIME_IMPORTS.search(source):
        findings.append({"rule": "retired-python-core-runtime", "path": path, "message": "Production Python core imports a retired schema/YAML semantic runtime"})
    if path.startswith("bindings/core/") and path.endswith((".ts", ".js", ".mjs")) and RUST_BINDING_FALLBACK.search(source):
        findings.append({"rule": "rust-binding-semantic-fallback", "path": path, "message": "Production Rust binding reaches the separate TypeScript reference semantic implementation"})
    if is_engine_source and FORBIDDEN_TS_IMPORTS.search(source):
        findings.append({"rule": "forbidden-javascript-engine-import", "path": path, "message": "UMF library source imports a JavaScript engine/runtime loader"})
    if is_engine_source and path.endswith(".py"):
        for match in FORBIDDEN_PY_IMPORTS.finditer(source):
            line = source.count("\n", 0, match.start()) + 1
            exception = allowed_debt.get(path)
            if exception and sha(ROOT / path) == exception.get("sha256") and any(pattern in match.group(0) for pattern in exception["patterns"]):
                continue
            findings.append({"rule": "forbidden-python-javascript-engine", "path": path, "line": line, "message": "Python library imports an embedded JavaScript engine without an exact source-scoped debt record"})
    if is_engine_source:
        match = PRIVATE_CROSS_PACKAGE_IMPORT.search(source)
        current_package = None
        parts = Path(path).parts
        if "src" in parts:
            index = parts.index("src")
            if len(parts) > index + 1:
                current_package = parts[index + 1]
        imported_package = match.group(1) + ("_access" if match.group(1) == "umf" and match.group(0).startswith("from umf_access") else "") if match else None
        if match and imported_package != current_package:
            findings.append({"rule": "cross-package-private-import", "path": path, "line": source.count("\n", 0, match.start()) + 1, "message": f"Cross-package import reaches private module {match.group(0).strip()}"})
    return findings


def cargo_manifest() -> Path | None:
    root_manifest = ROOT / "Cargo.toml"
    return root_manifest if root_manifest.is_file() else None


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


def legacy_lock_qualification() -> dict[str, object]:
    baseline_path = ROOT / "docs/helix/04-build/evidence/rust-migration/r2/r1-lock-baseline.json"
    if sha(baseline_path) != "fd9ad4af6fa6522dd921854214574c88e63624d22f58a9eae4f42b92ba83254c":
        return {"status": "fail", "changedHistoricalPackages": ["baseline-integrity"], "historicalLockfileSha256": "invalid"}
    baseline = json.loads(baseline_path.read_text())
    current = tomllib.loads((ROOT / "Cargo.lock").read_text())["package"]
    changed = [p["name"] + "@" + p["version"] for p in baseline["packages"] if p not in current]
    return {"status": "pass" if not changed else "fail", "changedHistoricalPackages": changed,
            "historicalLockfileSha256": baseline["sourceLockfileSha256"], "currentLockfileSha256": sha(ROOT / "Cargo.lock")}


def qualify_wasm_entropy_exception(*, target: str, wasm_bindgen_ids: list[str], paths: list[list[str]], incoming_edges: list[dict[str, object]], source_hashes: dict[str, str], features: dict[str, list[str]]) -> dict[str, object]:
    parents = {f"{edge.get('name')}@{edge.get('version')}" for edge in incoming_edges}
    edge_is_exact = len(incoming_edges) == len(parents) and parents == WASM_R1_ENTROPY_EXCEPTION["incomingParents"]
    expected_features = {"ahash": {"default", "getrandom", "runtime-rng", "serde", "std"}, "getrandom": {"default", "wasm_js"}}
    features_are_exact = features == {name: sorted(required) for name, required in expected_features.items()}
    qualified = (target == WASM_R1_ENTROPY_EXCEPTION["target"]
                 and wasm_bindgen_ids == ["wasm-bindgen@0.2.100"]
                 and paths == [WASM_R1_ENTROPY_EXCEPTION["path"]]
                 and edge_is_exact
                 and source_hashes == WASM_R1_ENTROPY_EXCEPTION["sourceHashes"]
                 and features_are_exact)
    return {"status": "qualified-r1-wasm-entropy-exception" if qualified else "unqualified",
            "target": target, "dependencyPath": paths, "wasmBindgenPackages": wasm_bindgen_ids,
            "incomingEdges": incoming_edges, "activeFeatures": features,
            "sourceHashes": source_hashes,
            "reason": "Target-only secure JavaScript entropy backend required by ahash runtime-rng in jsonschema's wasm32 dependency graph; exact source and dependency path are pinned.",
            "qualificationLimits": ["Only wasm32-unknown-unknown is covered.", "Any direct, additional or changed wasm-bindgen path fails this exception.", "Browser Crypto preflight and fresh-context deterministic checks are separate binding evidence."]}


def cargo_edge_is_active(parent_package: dict[str, object], parent_node: dict[str, object], dependency_edge: dict[str, object]) -> bool:
    """Filter Cargo's resolved node edges using the parent's enabled features.

    Cargo metadata can list target/optional edges that are present in a workspace
    graph but not enabled for this package. The dependency package's node may
    still be feature-unified by another workspace member, so traverse only edges
    activated by this parent package's own resolved feature set.
    """
    dep_name = dependency_edge.get("name")
    dep_kinds = dependency_edge.get("dep_kinds", [])
    if dep_kinds and all(kind.get("kind") == "dev" for kind in dep_kinds):
        return False
    declaration = next((dep for dep in parent_package.get("dependencies", [])
                        if (dep.get("rename") or dep.get("name")) == dep_name), None)
    if declaration is None or not declaration.get("optional"):
        return True
    alias = declaration.get("rename") or declaration.get("name")
    enabled = set(parent_node.get("features", []))
    if alias in enabled:
        return True
    features = parent_package.get("features", {})
    for feature_name in enabled:
        for member in features.get(feature_name, []):
            if member in {alias, f"dep:{alias}"} or (member.startswith(alias + "/") and not member.startswith(alias + "?/")):
                return True
    return False


def cargo_metadata(platform: str) -> dict[str, object]:
    cargo = shutil.which("cargo") or ("/opt/homebrew/opt/rustup/bin/cargo" if Path("/opt/homebrew/opt/rustup/bin/cargo").exists() else None)
    if not cargo:
        return {"status": "error", "stderr": "cargo is unavailable"}
    lock_path = ROOT / "Cargo.lock"
    if not lock_path.is_file():
        return {"status": "error", "stderr": "Cargo.lock is missing"}
    command = [cargo, "metadata", "--format-version", "1", "--locked", "--offline", "--filter-platform", platform]
    env = os.environ.copy()
    env["PATH"] = str(Path(cargo).parent) + os.pathsep + env.get("PATH", "")
    # These outputs are parsed as JSON/tree records; hosted CI exports `always`.
    env["CARGO_TERM_COLOR"] = "never"
    proc = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, env=env)
    if proc.returncode:
        return {"status": "error", "stderr": proc.stderr.strip(), "command": command}
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        return {"status": "error", "stderr": f"invalid cargo metadata JSON: {exc}"}
    return {"status": "resolved", "data": data, "lockfileSha256": sha(lock_path), "command": command}


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


def parse_cargo_feature_tree(source: str, package: str) -> list[str]:
    return sorted(set(re.findall(rf"(?m)^.*?\b{re.escape(package)} feature \"([^\"]+)\"", source)))


def parse_cargo_tree_packages(source: str) -> set[str]:
    found = set()
    for line in source.splitlines():
        match = re.match(r"^([A-Za-z0-9_.+-]+) v([^\s]+)", line.strip())
        if match:
            found.add(f"{match.group(1)}@{match.group(2)}")
    return found


def parse_inverse_cargo_tree(source: str) -> tuple[list[str], list[list[str]]]:
    """Return direct inverse-tree parents and all paths from wasm-bindgen to core."""
    lines = source.splitlines()
    if not lines:
        return [], []
    def label(line: str) -> str | None:
        match = re.match(r"^([A-Za-z0-9_.+-]+) v([^\s]+)", line.strip())
        return f"{match.group(1)}@{match.group(2)}" if match else None
    root = label(lines[0])
    if not root:
        return [], []
    stack = [root]
    direct = []
    core_paths = []
    for line in lines[1:]:
        tree = re.match(r"^(?P<indent>(?:│   |    )*)(?:(?:├── |└── )(?P<label>.*))$", line)
        if not tree:
            continue
        depth = len(tree.group("indent")) // 4 + 1
        node = label(tree.group("label"))
        if not node:
            continue
        stack = stack[:depth]
        stack.append(node)
        if depth == 1:
            direct.append(node)
        if node.startswith("umf-rust-spike-core@"):
            core_paths.append(list(stack))
    return direct, core_paths


def check_cargo() -> tuple[list[dict[str, object]], dict[str, object]]:
    findings: list[dict[str, object]] = []
    if not cargo_manifest():
        return findings, {"status": "no-cargo-workspace", "hostFreeCore": "not-applicable"}
    rustc = shutil.which("rustc") or ("/opt/homebrew/opt/rustup/bin/rustc" if Path("/opt/homebrew/opt/rustup/bin/rustc").exists() else None)
    rust_info = subprocess.run([rustc, "-vV"], capture_output=True, text=True).stdout if rustc else ""
    native = re.search(r"(?m)^host: (\S+)", rust_info)
    targets = [native.group(1) if native else "x86_64-unknown-linux-gnu", "wasm32-unknown-unknown"]
    reports = []
    all_core_packages: set[str] = set()
    all_core_closures: dict[str, set[str]] = {}
    wasm_exception = {"status": "not-applicable"}
    cargo = shutil.which("cargo") or ("/opt/homebrew/opt/rustup/bin/cargo" if Path("/opt/homebrew/opt/rustup/bin/cargo").exists() else None)
    if not cargo:
        return [{"rule": "cargo-graph-unresolved", "path": "Cargo.toml", "message": "cargo is unavailable"}], {"status": "unverified", "hostFreeCore": "unverified"}
    for platform in targets:
        result = cargo_metadata(platform)
        if result.get("status") != "resolved":
            findings.append({"rule": "cargo-graph-unresolved", "path": "Cargo.toml", "target": platform, "message": str(result.get("stderr") or result.get("reason"))})
            reports.append({"target": platform, "status": "unverified", "stderr": result.get("stderr")})
            continue
        data = result["data"]
        core_packages = [p for p in data["packages"] if p["name"] == "umf-rust-spike-core" and p["id"] in data["workspace_members"]]
        if not core_packages:
            findings.append({"rule": "rust-core-crate-missing", "path": "Cargo.toml", "target": platform, "message": "Workspace core member umf-rust-spike-core is absent from cargo metadata"})
        # Cargo metadata's resolve.nodes is workspace feature-unified. Its optional
        # target edges can therefore look active on a package when another member
        # enables them. Use package-selected cargo tree output for the actual core
        # closure, and the inverse binding tree to qualify the sole R1 entropy edge.
        core_tree = cargo_tree(cargo, platform, "umf-rust-spike-core")
        if core_tree["status"] != "resolved":
            findings.append({"rule": "cargo-core-tree-unresolved", "path": "Cargo.toml", "target": platform, "message": str(core_tree.get("stderr"))})
            reports.append({"target": platform, "status": "unverified", "stderr": core_tree.get("stderr")})
            continue
        closure = parse_cargo_tree_packages(core_tree["stdout"])
        all_core_packages.add("umf-rust-spike-core")
        all_core_closures[platform] = closure
        for finding in core_dependency_findings({package.split("@", 1)[0] for package in closure}, "cargo tree -p umf-rust-spike-core"):
            finding["target"] = platform
            finding["message"] = f"Package-selected active core dependency closure contains host/runtime crate {finding['crate']}"
            findings.append(finding)
        dependency_paths = {}
        if platform == WASM_R1_ENTROPY_EXCEPTION["target"]:
            binding_tree = cargo_tree(cargo, platform, "umf-rust-spike-wasm", inverse="wasm-bindgen")
            if binding_tree["status"] != "resolved":
                findings.append({"rule": "wasm-entropy-tree-unresolved", "path": "Cargo.toml", "target": platform, "message": str(binding_tree.get("stderr"))})
                wasm_exception = {"status": "unqualified", "stderr": binding_tree.get("stderr")}
            else:
                incoming, inverse_paths = parse_inverse_cargo_tree(binding_tree["stdout"])
                # Keep only the exact core-to-wasm-bindgen route. Other parents in
                # the inverse graph (binding, js-sys) are separately pinned below.
                core_paths = [[*reversed(path)] for path in inverse_paths]
                wasm_bindgen_ids = [binding_tree["stdout"].splitlines()[0].split(" v", 1)[0] + "@" + binding_tree["stdout"].splitlines()[0].split(" v", 1)[1].split()[0]]
                incoming_wasm_edges = [{"name": value.split("@", 1)[0], "version": value.split("@", 1)[1]} for value in incoming]
            source_hashes = {path: sha(ROOT / path) if (ROOT / path).is_file() else "missing" for path in WASM_R1_ENTROPY_EXCEPTION["sourceHashes"]}
            legacy_lock = legacy_lock_qualification()
            if legacy_lock["status"] == "pass":
                source_hashes["Cargo.lock"] = legacy_lock["historicalLockfileSha256"]
            feature_trees = {name: cargo_tree(cargo, platform, "umf-rust-spike-wasm", inverse=name, edges="features") for name in ("ahash", "getrandom")}
            active_features = {name: parse_cargo_feature_tree(tree["stdout"], name) for name, tree in feature_trees.items() if tree["status"] == "resolved"}
            for name, tree in feature_trees.items():
                if tree["status"] != "resolved":
                    findings.append({"rule": "wasm-feature-tree-unresolved", "path": "Cargo.toml", "target": platform, "crate": name, "message": str(tree.get("stderr"))})
            if binding_tree["status"] == "resolved":
                wasm_exception = qualify_wasm_entropy_exception(target=platform, wasm_bindgen_ids=wasm_bindgen_ids,
                    paths=core_paths, incoming_edges=incoming_wasm_edges,
                    source_hashes=source_hashes, features=active_features)
                wasm_exception["additiveWorkspaceLockQualification"] = legacy_lock
                wasm_exception["bindingInverseTree"] = {"directParents": incoming, "corePathsFromWasmBindgen": inverse_paths}
                wasm_exception["featureTreeCommands"] = [tree["command"] for tree in feature_trees.values()]
                if wasm_exception["status"] != "qualified-r1-wasm-entropy-exception":
                    findings.append({"rule": "wasm-entropy-exception-unqualified", "path": "cargo tree -p umf-rust-spike-wasm -i wasm-bindgen", "target": platform,
                                     "message": "Target-only wasm-bindgen dependency does not match the exact R1 path, direct parents, feature set and source hashes",
                                     "exception": wasm_exception})
        for rust_file in sorted((ROOT / "crates/rust-spike-core").glob("**/*.rs")):
            content = rust_file.read_text(encoding="utf-8")
            for match in CORE_HOST_MODULES.finditer(content):
                findings.append({"rule": "host-capability-in-rust-core", "path": rust_file.relative_to(ROOT).as_posix(), "line": content.count("\n", 0, match.start()) + 1, "message": f"Core imports host capability {match.group(0)}"})
        reports.append({"target": platform, "status": "resolved", "corePackages": [p["name"] for p in core_packages], "resolvedActiveCoreClosure": sorted(closure), "dependencyPathsToHostCrates": dependency_paths, "cargoCommands": [result["command"], core_tree["command"]]})
    rust_version = subprocess.run([rustc, "--version"], capture_output=True, text=True).stdout.strip() if rustc else None
    lock_hash = sha(ROOT / "Cargo.lock") if (ROOT / "Cargo.lock").is_file() else None
    status = "resolved" if reports and all(r["status"] == "resolved" for r in reports) else "unverified"
    host_free = "unverified" if status != "resolved" else "qualified-with-r1-wasm-entropy-exception" if wasm_exception.get("status") == "qualified-r1-wasm-entropy-exception" else "pass" if not findings else "fail"
    return findings, {"status": status, "lockfileSha256": lock_hash, "hostFreeCore": host_free, "wasmEntropyException": wasm_exception, "corePackages": sorted(all_core_packages),
                      "activeCoreClosureByTarget": {target: sorted(closure) for target, closure in all_core_closures.items()}, "targets": reports, "rustcVersion": rust_version}


def check_production_core() -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    findings, reports = [], []
    cargo = shutil.which("cargo") or "/opt/homebrew/opt/rustup/bin/cargo"
    rustc = shutil.which("rustc") or "/opt/homebrew/opt/rustup/bin/rustc"
    info = subprocess.run([rustc, "-vV"], capture_output=True, text=True).stdout
    host = re.search(r"(?m)^host: (\S+)", info)
    for target in [host.group(1) if host else "x86_64-unknown-linux-gnu", "wasm32-unknown-unknown"]:
        for package in ["umf-core", "umf-core-wire", "umf-metamodel"]:
            result = cargo_tree(cargo, target, package)
            closure = parse_cargo_tree_packages(result["stdout"])
            names = {p.split("@", 1)[0] for p in closure}
            # Production has no R1 entropy exception, including transitive getrandom.
            forbidden = names & (CORE_HOST_CRATES | {"getrandom", "jsonschema", "ahash"})
            if result["status"] != "resolved" or forbidden:
                findings.append({"rule": "production-core-host-dependency", "path": "Cargo.toml", "target": target, "message": str(result["stderr"] or sorted(forbidden))})
            reports.append({"package": package, "target": target, "closure": sorted(closure), "status": "pass" if result["status"] == "resolved" and not forbidden else "fail"})
    for folder in ["crates/umf-core/src", "crates/umf-core-wire/src", "crates/umf-metamodel/src"]:
        for path in sorted((ROOT / folder).rglob("*.rs")):
            source = path.read_text()
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
    # Individual exact-file exceptions make the current V8 debt visible to the migration gate.
    active_debt: dict[str, dict[str, object]] = {}
    debt_status = []
    for path, record in V8_DEBT.items():
        full = ROOT / path
        expected = record["sha256"]
        if not expected:
            raise RuntimeError(f"V8 debt needs a pinned source hash: {path}")
        if not full.is_file() or sha(full) != expected:
            findings.append({"rule": "v8-debt-source-drift", "path": path, "message": "Exact pre-R4 exception source changed; review and update or remove the debt record"})
        else:
            active_debt[path] = record
            debt_status.append({"path": path, "sha256": expected, "reason": record["reason"], "patterns": record["patterns"], "status": "source-exact pre-R4 debt"})
    library_paths = []
    for folder in [ROOT / "src", ROOT / "python/src", ROOT / "python/umf_access/src", ROOT / "python/umf_codegen/src", ROOT / "bindings"]:
        if folder.exists():
            library_paths.extend(p for p in folder.rglob("*") if p.suffix in {".ts", ".tsx", ".js", ".mjs", ".cjs", ".py"})
    for path in sorted(library_paths):
        p = path.relative_to(ROOT).as_posix()
        findings.extend(scan_text(p, path.read_text(encoding="utf-8", errors="replace"), allowed_debt=active_debt))
    cargo_findings, cargo_summary = check_cargo()
    findings.extend(cargo_findings)
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
                    "legacyV8AllowedOnlyAtExactDebtFile": "pass" if scan_text("python/umf_codegen/src/umf_codegen/_embedded.py", "from py_mini_racer import MiniRacer", allowed_debt=active_debt) == [] else "fail",
                    "unscopedV8ImportRejected": "pass" if scan_text("python/umf_access/src/umf_access/fake.py", "import py_mini_racer", allowed_debt=active_debt) else "fail",
                    "privateCrossPackageImportRejected": "pass" if any(f["rule"] == "cross-package-private-import" for f in scan_text("python/src/umf/new.py", "from umf_access._internal import x")) else "fail",
                    "allowedRelativeImportAccepted": "pass" if not scan_text("src/model/new.ts", "import { x } from '../validation/index.js';") else "fail",
                    "temporaryManifestAllowedDependency": "pass" if not core_dependency_findings(allowed_names) else "fail",
                    "temporaryManifestForbiddenDependency": "pass" if core_dependency_findings(forbidden_names) else "fail",
                    "bindingSourceEngineImportRejected": "pass" if scan_text("bindings/rust-spike/node/index.js", "import vm from 'node:vm';") else "fail"}
    return {"schema": "umf.rust-boundary-check/0.1", "status": "pass" if not findings and all(v == "pass" for v in controls.values()) else "fail", "checkedSourceModules": len(library_paths),
            "cargo": cargo_summary, "productionCore": production_reports, "generatedProvenance": provenance, "v8Debt": debt_status, "negativeControls": controls, "findings": findings}


def main() -> int:
    if "--print-debt-hashes" in sys.argv:
        for path in V8_DEBT:
            print(path, sha(ROOT / path))
        return 0
    if "--self-test" in sys.argv:
        result = run(check_controls=True)
        print(json.dumps(result, indent=2))
        return 0 if result["status"] == "pass" else 1
    result = run(check_controls=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], "checkedSourceModules": result["checkedSourceModules"], "cargoStatus": result["cargo"]["status"], "productionCoreStatus": "pass" if all(r["status"] == "pass" for r in result["productionCore"]) else "fail", "v8DebtCount": len(result["v8Debt"]), "negativeControls": result["negativeControls"], "findingCount": len(result["findings"])}))
    if result["findings"]:
        for finding in result["findings"]:
            print(f"{finding['rule']}: {finding.get('path')}: {finding['message']}", file=sys.stderr)
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
