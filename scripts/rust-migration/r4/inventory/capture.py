#!/usr/bin/env python3
"""Capture the live R4-R8 successor census without rewriting R0 or R3."""
from __future__ import annotations

import ast
import collections
import hashlib
import importlib.util
import json
import sys
import tempfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "docs/helix/04-build/evidence/rust-migration/r4/inventory/census.json"
R3_ROOT = ROOT / "docs/helix/04-build/evidence/rust-migration/r3"
R3_SOURCE = R3_ROOT / "baseline/source-manifest.json"
R3_SUPPLEMENT = R3_ROOT / "supplement/source-manifest.json"
BASELINE_SCRIPT = ROOT / "scripts/rust-inventory.py"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_canonical_output(path: Path) -> bool:
    return path.resolve() == OUT.resolve()


def refuses_canonical_replace(output: Path, authority_status: str, *, check_only: bool) -> bool:
    """Protect writes to the canonical census without blocking read-only diagnostics."""
    return is_canonical_output(output) and authority_status != "current" and not check_only


def census_check_passes(stored_payload: str, fresh_payload: str, authority_status: str) -> bool:
    """A matching census is qualified only when its metamodel cohort is current."""
    return stored_payload == fresh_payload and authority_status == "current"


def metamodel_authority_snapshot(root: Path = ROOT) -> dict[str, object]:
    """Bind authored metamodel inputs and their generated schema/output cohort."""
    manifest_path = root / "spec/metamodel/generated/manifest.json"
    result: dict[str, object] = {
        "manifest": {"path": "spec/metamodel/generated/manifest.json", "sha256": None},
        "sources": [], "schemaInputs": [], "outputs": [],
        "manifestDigestStatus": "unverified",
        "verification": "manifest-digests-only; run bun scripts/metamodel/build.ts --check separately to verify the generated fixed point",
    }
    if not manifest_path.is_file():
        result["manifestDigestStatus"] = "missing-manifest"
        return result

    raw = manifest_path.read_bytes()
    result["manifest"] = {"path": "spec/metamodel/generated/manifest.json", "sha256": digest(raw)}
    try:
        manifest = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        result["manifestDigestStatus"] = "invalid-manifest"
        return result
    if not isinstance(manifest, dict) or manifest.get("profile") != "umf.metamodel.outputs/1":
        result["manifestDigestStatus"] = "unsupported-manifest"
        return result

    sources = manifest.get("sources")
    outputs = manifest.get("outputs")
    if (not isinstance(sources, dict) or not isinstance(outputs, dict) or
            "spec/metamodel/umf.yaml" not in sources or
            "spec/core/schema.json" not in outputs or
            "src/generated/core-model.ts" not in outputs):
        result["manifestDigestStatus"] = "invalid-manifest"
        return result

    def safe_repo_path(path: object) -> bool:
        if not isinstance(path, str) or not path or "\\" in path or ":" in path:
            return False
        parsed = PurePosixPath(path)
        if parsed.is_absolute() or not all(part not in {"", ".", ".."} for part in parsed.parts):
            return False
        try:
            return (root / path).resolve().is_relative_to(root.resolve())
        except (OSError, RuntimeError):
            return False

    if not all(safe_repo_path(path) for path in [*sources, *outputs]):
        result["manifestDigestStatus"] = "invalid-manifest-paths"
        return result

    def rows(entries: dict[str, object], *, output: bool) -> list[dict[str, object]]:
        captured = []
        for path, declaration in sorted(entries.items()):
            expected = declaration.get("sha256") if output and isinstance(declaration, dict) else declaration
            file_path = root / path
            actual = digest(file_path.read_bytes()) if file_path.is_file() else None
            captured.append({"path": path, "expectedSha256": expected, "sha256": actual,
                             "matches": isinstance(expected, str) and actual == expected})
        return captured

    source_rows = rows(sources, output=False)
    output_rows = rows(outputs, output=True)
    schema_rows = [item for item in source_rows + output_rows
                   if str(item["path"]).startswith("spec/core/") and
                   (str(item["path"]).endswith(".schema.json") or
                    Path(str(item["path"])).name == "schema.json")]
    result["sources"] = source_rows
    result["schemaInputs"] = schema_rows
    result["outputs"] = output_rows
    result["manifestDigestStatus"] = "current" if all(item["matches"] for item in source_rows + output_rows) else "stale"
    return result


def load_inventory_builder():
    spec = importlib.util.spec_from_file_location("umf_rust_inventory_r3_builder", BASELINE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load existing inventory mechanism: {BASELINE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def r3_sources() -> dict[str, str]:
    output: dict[str, str] = {}
    for label, path in (("r3-baseline", R3_SOURCE), ("r3-supplement", R3_SUPPLEMENT)):
        if not path.is_file():
            raise RuntimeError(f"Required R3 source manifest is missing: {path}")
        data = json.loads(path.read_text())
        for entry in data.get("files", []):
            name = entry.get("path", "")
            if name.startswith(("src/", "python/src/", "python/umf_access/src/", "python/umf_codegen/src/")):
                output[name] = label
    return output


def family_for(path: str) -> tuple[str, str, str, str]:
    """Return migration track, named family owner role, disposition, gate."""
    if path.startswith("src/generated/") or path.endswith("generated_core.py"):
        return ("R7", "ADR-005 metamodel authority owner", "retain generated output; regenerate from authored metamodel", "fixed-point and provenance gate")
    if path == "src/index.ts":
        return ("R7", "R7 public-facade owner", "retain API names and route each operation to qualified Rust binding", "export parity and no-fallback gate")
    if path.startswith(("src/model/", "src/validation/", "src/registry/")):
        return ("R5/R7", "R5 core-model family owner", "port or bind shared operations; retire duplicate JS kernel after parity", "CONTRACT-001 and current core family tests/oracles")
    if path.startswith("src/core-ideals/"):
        name = path.removeprefix("src/core-ideals/").removesuffix(".ts")
        return ("R5", f"R5 core-ideal family owner: {name}", "port ideal inspection/classification/projection semantics", "contract-specific native oracle and both recovery directions")
    if path.startswith("src/adapters/"):
        name = path.removeprefix("src/adapters/").split("/", 1)[0].removesuffix(".ts")
        return ("R5", f"R5 adapter family owner: {name}", "port the declared adapter subset; retain explicit losses and unknown content", "current family contract, browser parity and pinned native oracle")
    if path.startswith("src/projections/"):
        name = path.removeprefix("src/projections/").removesuffix(".ts").replace("/", "-")
        return ("R5", f"R5 projection family owner: {name}", "port source-to-target mapping and complete loss report", "source and target family qualification plus independent target oracle")
    if path.startswith("src/extensions/"):
        name = path.removeprefix("src/extensions/").split("/", 1)[0].removesuffix(".ts")
        return ("R5", f"R5 extension family owner: {name}", "port shared extension semantics; preserve payload and caller-owned capabilities", "current extension contract and unknown-content controls")
    if path.startswith("src/domain-packs/"):
        name = path.removeprefix("src/domain-packs/").removesuffix(".ts")
        return ("R5", f"R5 domain-pack owner: {name}", "port pure pack admission/preservation; retain source acquisition and I/O", "pack manifest/source-custody and browser consumer checks")
    if path.startswith(("src/access/", "src/compilation/", "src/table-deployment/", "src/table-migration/", "src/table-authoring/")):
        name = path.removeprefix("src/").split("/", 1)[0]
        return ("R3/R4/R7", f"R3 codegen family owner: {name}", "R3 semantic port qualified; R4 Python/CLI cutover qualified; R7 JS/browser default cutover remains staged", "R3 frozen operation corpus plus installed runtime and no-V8 checks")
    if path.startswith("python/umf_codegen/src/"):
        return ("R4", "R4 Python codegen binding owner", "retain Python API and writer boundary; dispatch through the installed Rust CLI", "fresh offline wheel tests with JavaScript runtimes absent")
    if path.startswith("python/src/umf/"):
        name = path.removeprefix("python/src/umf/")
        if name in {"constraint_kernel.py", "literal_kernel.py", "json.py", "serialization.py"}:
            return ("R4/R7", f"R4 Python core binding owner: {name}", "preserve Python value and diagnostic boundary; retire duplicate semantic execution after parity", "installed wheel parity, exact value and error controls")
        return ("R4/R7", f"R4 Python core binding owner: {name}", "preserve public Python presentation and delegate shared execution to Rust", "installed wheel public API and callback/resource parity")
    if path.startswith("python/umf_access/src/"):
        module = path.removeprefix("python/umf_access/src/umf_access/")
        if module.startswith("umf_access/"):
            module = module.removeprefix("umf_access/")
        if module in {"capture.py", "delta_read.py", "pages.py", "postgres_bulk.py", "postgres_read.py", "postgres_search.py", "unity_search.py"} or module.startswith(("unified/session_", "unified/native_binding.py", "unified/_binding.py")):
            return ("R6", f"R6 host-integration owner: {module}", "retain Python driver/session/transaction/async/transport integration", "installed native driver, cancellation, transaction and authorization checks")
        if module.startswith("dsl/"):
            return ("R6", f"R6 generated-client ergonomics owner: {module}", "preserve generated Python client surface; move shared validation/rendering after parity", "stdlib-only generated client typing and runtime checks")
        if module.endswith("__init__.py") or module in {"protocols.py", "types.py"}:
            return ("R6", f"R6 Python public-boundary owner: {module}", "retain public API/value boundary and narrow host interfaces", "import/export compatibility and host-value admission")
        return ("R6", f"R6 shared-access algorithm owner: {module}", "port portable request/codec/planner/checking semantics; retain execution in host", "contract-scoped Rust/Python/native integration parity")
    return ("unresolved", "unassigned owner", "unresolved; disposition requires review", "human review before migration closure")


def python_edges(module: dict[str, object], by_path: dict[str, dict[str, object]]) -> list[str]:
    """Resolve authored relative Python imports within the three owned packages."""
    path = str(module["path"])
    markers = ("python/src/", "python/umf_access/src/", "python/umf_codegen/src/")
    marker = next((item for item in markers if path.startswith(item)), None)
    if not marker:
        return []
    package_root = marker.rstrip("/")
    relpath = path[len(package_root) + 1:]
    module_parts = relpath[:-3].split("/")
    if module_parts[-1] == "__init__":
        module_parts.pop()
        package_parts = module_parts
    else:
        package_parts = module_parts[:-1]
    source = (ROOT / path).read_text(encoding="utf-8")
    tree = ast.parse(source, filename=path)
    known = set(by_path)
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if node.level:
                base = package_parts[:max(0, len(package_parts) - node.level + 1)]
                target = base + (node.module.split(".") if node.module else [])
                candidates = ["/".join([package_root, *target]) + ".py",
                              "/".join([package_root, *target, "__init__.py"])]
                found.update(item for item in candidates if item in known)
                if node.module is None:
                    for alias in node.names:
                        sub = target + alias.name.split(".")
                        candidates = ["/".join([package_root, *sub]) + ".py",
                                      "/".join([package_root, *sub, "__init__.py"])]
                        found.update(item for item in candidates if item in known)
            else:
                absolute = node.module or ""
                prefix = package_root.split("/src/")[-1].replace("/", ".")
                if absolute == prefix or absolute.startswith(prefix + "."):
                    target = absolute.split(".")
                    candidates = ["/".join([package_root, *target[1:]]) + ".py",
                                  "/".join([package_root, *target[1:], "__init__.py"])]
                    found.update(item for item in candidates if item in known)
    return sorted(found)


def reachability(modules: list[dict[str, object]], scripts: list[dict[str, object]], ts_files: dict[str, object]) -> dict[str, list[str]]:
    by_path = {str(module["path"]): module for module in modules}
    graph: dict[str, list[str]] = {}
    for path, module in by_path.items():
        if module["language"] == "typescript":
            graph[path] = [p for p in module.get("resolvedImports", []) if p in by_path]
        else:
            graph[path] = python_edges(module, by_path)
            module["resolvedImports"] = graph[path]

    roots: dict[str, list[str]] = {
        "typescript-public-sdk": ["src/index.ts"],
        "python-core-public": ["python/src/umf/__init__.py"],
        "python-codegen-public": ["python/umf_codegen/src/umf_codegen/__init__.py"],
    }
    for script in scripts:
        path = str(script["path"])
        if not script.get("active"):
            continue
        if path in by_path and path.startswith("python/"):
            roots.setdefault(f"active-python-module:{path}", []).append(path)
        if path.endswith((".ts", ".tsx", ".js", ".mjs", ".cjs")):
            captured = ts_files.get(path, {})
            for dependency in captured.get("resolvedImports", []):
                if dependency in by_path:
                    roots.setdefault(f"active-script:{path}", []).append(dependency)
        elif path.endswith(".py"):
            source = (ROOT / path).read_text(encoding="utf-8")
            tree = ast.parse(source, filename=path)
            for node in ast.walk(tree):
                names = []
                if isinstance(node, ast.Import):
                    names.extend(alias.name for alias in node.names)
                elif isinstance(node, ast.ImportFrom):
                    base = node.module or ""
                    if base:
                        names.append(base)
                    if not base:
                        names.extend(alias.name for alias in node.names)
                for name in names:
                    for package in ("umf_access", "umf_codegen", "umf"):
                        if name == package or name.startswith(package + "."):
                            module_name = name.replace(".", "/")
                            candidates = []
                            for package_root in ("python/src", "python/umf_access/src", "python/umf_codegen/src"):
                                candidates.extend((f"{package_root}/{module_name}.py", f"{package_root}/{module_name}/__init__.py"))
                            matches = [candidate for candidate in candidates if candidate in by_path]
                            if matches:
                                roots.setdefault(f"active-python-script:{path}", []).extend(matches)
    reached: dict[str, list[str]] = collections.defaultdict(list)
    for name, start in roots.items():
        todo = [path for path in start if path in graph]
        seen: set[str] = set()
        while todo:
            path = todo.pop()
            if path in seen:
                continue
            seen.add(path)
            reached[path].append(name)
            todo.extend(graph[path])
    return {path: sorted(set(names)) for path, names in reached.items()}


def enrich(data: dict[str, object], builder, ts_files: dict[str, object]) -> dict[str, object]:
    sources = r3_sources()
    modules = data["sourceModules"]
    assert isinstance(modules, list)
    scripts = data["scripts"]
    assert isinstance(scripts, list)
    reached = reachability(modules, scripts, ts_files)
    active_script_by_path = {str(item["path"]): item for item in scripts if item.get("active")}
    unresolved = []
    r3_ported_roots = ("src/access/", "src/compilation/", "src/table-deployment/", "src/table-migration/")
    r3_partial_roots = ("src/extensions/actions/", "src/extensions/binding/", "src/extensions/tables/",
                        "src/model/", "src/validation/", "src/registry/")
    for module in modules:
        path = str(module["path"])
        module_path = ROOT / path
        module["declaredAlgorithms"] = builder.algorithm_names(module_path, module_path.read_text(encoding="utf-8"))
        module["reachedFrom"] = reached.get(path, [])
        activation = active_script_by_path.get(path)
        module["activationEvidence"] = (activation.get("activationEvidence", []) if activation else
                                        ["reached from " + name for name in reached.get(path, [])])
        module["reachabilityEvidence"] = ("static TypeScript closure from src/index.ts plus active scripts" if module["language"] == "typescript"
                                          else "static relative Python package closure from __init__ and active Python tests/scripts")
        module["reachableAlgorithms"] = module["declaredAlgorithms"] if module["reachedFrom"] else []
        track, owner, disposition, gate = family_for(path)
        module["migrationTrack"] = track
        module["owner"] = owner
        module["retirementDisposition"] = disposition
        module["closureGate"] = gate
        module["r3SourceManifest"] = sources.get(path)
        if path.startswith(r3_ported_roots):
            module["r3SemanticStatus"] = "ported-operation-closure; retained TypeScript is an oracle/reference pending runtime cutover"
        elif path.startswith(r3_partial_roots):
            module["r3SemanticStatus"] = "R3-reached dependency; remaining public semantic operations need symbol-level reconciliation"
        elif path in sources:
            module["r3SemanticStatus"] = "R3 evidence input only; manifest membership does not prove its semantics were ported"
        else:
            module["r3SemanticStatus"] = "outside R3 source manifest"
        module["unresolved"] = []
        if track == "unresolved":
            module["unresolved"].append("no defensible family/owner rule matched")
        if module["language"] == "typescript" and path.startswith("src/") and not module["reachedFrom"]:
            module["unresolved"].append("not reached from public TypeScript index; activation or intentional private status requires review")
        if module["language"] == "python" and path.startswith("python/umf_access/src/") and not module["reachedFrom"]:
            module["unresolved"].append("not reached from active package or Python test imports; consumer reachability needs review")
        if str(module["r3SemanticStatus"]).startswith("R3-reached"):
            module["unresolved"].append("R3 dependency use is narrower than full public module API; symbol-level retirement map required")
        if path.startswith(r3_ported_roots) and path not in sources:
            module["unresolved"].append("R3 operation-root module is absent from baseline and supplement source manifests; successor provenance required")
        if module["unresolved"]:
            unresolved.append(path)

    r3_operations = [
        {"id": "generate", "track": "R3 ported / R4 Python cutover / R7 TS-Bun-browser default", "baseline": "r3/baseline/operations.json"},
        {"id": "deployment", "track": "R3 ported / R4 Python-CLI cutover / R7 JS-browser default", "baseline": "r3/baseline/operations.json"},
        {"id": "verify_deployment", "track": "R3 ported / R4 Python-CLI cutover / R7 JS-browser default", "baseline": "r3/baseline/operations.json"},
        {"id": "migration", "track": "R3 ported / R4 Python-CLI cutover / R7 JS-browser default", "baseline": "r3/baseline/operations.json"},
        {"id": "verify_migration", "track": "R3 ported / R4 Python-CLI cutover / R7 JS-browser default", "baseline": "r3/baseline/operations.json"},
        {"id": "discover_changes", "track": "R3 ported / R4 Python-CLI cutover / R7 JS-browser default", "baseline": "r3/baseline/operations.json"},
        {"id": "row_scope", "track": "R3 ported / R4 Python-CLI cutover / R7 JS-browser default", "baseline": "r3/baseline/operations.json"},
        {"id": "generate_access_package", "track": "R3 ported / R7 TypeScript default cutover", "baseline": "r3/baseline/stage-one.json"},
        {"id": "diff_access_packages", "track": "R3 ported / R7 TypeScript default cutover", "baseline": "r3/baseline/stage-one.json"},
    ]
    r7_tooling = [item["path"] for item in scripts if item.get("active") and
                  (str(item["path"]).startswith("scripts/metamodel/") or
                   str(item["path"]).startswith("scripts/reference/") or
                   str(item["path"]).startswith("docs/helix/05-deploy/schema-browser/"))]
    authority = metamodel_authority_snapshot()
    data["metamodelAuthority"] = authority
    base_cohort = str(data["capture"].get("sourceCohortSha256", ""))
    authority_cohort = digest(json.dumps(authority, ensure_ascii=False, sort_keys=True,
                                         separators=(",", ":")).encode())
    data["capture"]["baseSourceCohortSha256"] = base_cohort
    data["capture"]["authorityCohortSha256"] = authority_cohort
    data["capture"]["sourceCohortSha256"] = digest(f"{base_cohort}\n{authority_cohort}\n".encode())
    data["schema"] = "umf.rust-migration-successor-census/1.1"
    data["capture"]["inventoryFormat"] = "1.1"
    data["capture"]["inventoryScript"] = "scripts/rust-migration/r4/inventory/capture.py"
    data["scope"] = "Live R4-R8 successor census. R0 and R3 inventories remain immutable historical evidence."
    data["r3OperationClosure"] = r3_operations
    operation_ids = {item["id"] for item in r3_operations if item["id"] not in {"generate_access_package", "diff_access_packages"}}
    for operation in data["operations"]:
        if operation["id"] in operation_ids:
            operation["historicalProductionImplementation"] = operation.get("productionImplementation")
            operation["productionImplementation"] = "installed Python wrapper dispatches to bundled umf Rust CLI; MiniRacer is not installed"
            operation["migrationDisposition"] = "R4 installed macOS arm64 CPython 3.11 cohort passed; R7 JS/browser default cutover remains staged"
            operation["r4Evidence"] = "docs/helix/04-build/evidence/rust-migration/r4/qualification.json"
        elif operation["id"] in {"generate_access_package", "diff_access_packages"}:
            operation["productionImplementation"] = "retained TypeScript stage-one compiler/diff; Rust parity is separately qualified"
            operation["migrationDisposition"] = "R7 default cutover remains staged"
    data["r3SourceManifests"] = [
        {"path": "docs/helix/04-build/evidence/rust-migration/r3/baseline/source-manifest.json",
         "sha256": digest(R3_SOURCE.read_bytes()), "meaning": "R3 baseline source/evidence cohort; inclusion alone is not semantic port proof"},
        {"path": "docs/helix/04-build/evidence/rust-migration/r3/supplement/source-manifest.json",
         "sha256": digest(R3_SUPPLEMENT.read_bytes()), "meaning": "R3 migration supplement source/evidence cohort"},
    ]
    data["r7ToolingRoots"] = {"activeScripts": sorted(r7_tooling),
                               "meaning": "Active metamodel/reference/browser build computation candidates; each module retains source and activation evidence."}
    data["summary"] = {
        "semanticModules": len(modules),
        "byTrack": dict(sorted(collections.Counter(str(m["migrationTrack"]) for m in modules).items())),
        "byLanguage": dict(sorted(collections.Counter(str(m["language"]) for m in modules).items())),
        "r3ManifestSourceModules": len(sources),
        "r3ExactOperationFamilies": 9,
        "unresolvedModuleRows": len(unresolved),
        "r7ActiveToolingScripts": len(r7_tooling),
        "unresolvedRows": sorted(unresolved),
    }
    data["knownOpenItems"] = [
        "R0/R3 are historical snapshots; this census hashes the current source cohort and does not rewrite them.",
        "R3 source-manifest membership indicates build/oracle input, not proof that every helper in a shared module was ported; overlapping modules are unresolved until symbol-level mapping is reviewed.",
        "R4 qualifies seven installed Python codegen operations through the bundled Rust CLI on the captured macOS arm64 CPython 3.11 cohort; it does not qualify JavaScript/browser default cutover or process RSS limits.",
        "Python umf_access is a submodule API whose consumer imports are dynamic; all rows remain live and require caller/consumer evidence.",
        "Human implementer assignment is not inferred; owner values name the family role, and unresolved rows require assignment before a shard starts.",
        "R5-R8 family contracts, versions, fixtures, independent oracles and installed host cohorts remain separate acceptance gates.",
        "Metamodel authority inputs and generated schemas/outputs are hash-bound against the generated manifest; this digest comparison is not a fixed-point check, which separately requires bun scripts/metamodel/build.ts --check.",
    ]
    return data


def main() -> int:
    if sys.version_info < (3, 11):
        print("R4 successor inventory requires Python 3.11+.", file=sys.stderr)
        return 2
    output = OUT
    if "--output" in sys.argv:
        index = sys.argv.index("--output")
        if index + 1 >= len(sys.argv) or sys.argv[index + 1].startswith("--"):
            print("--output requires a census path", file=sys.stderr)
            return 2
        output = Path(sys.argv[index + 1])
        if not output.is_absolute():
            output = ROOT / output
    builder = load_inventory_builder()
    captured_ts: dict[str, object] = {}
    original_check_output = builder.subprocess.check_output
    def checked_output(*args, **kwargs):
        result = original_check_output(*args, **kwargs)
        if len(args) and args[0] == ["bun", "scripts/rust-inventory-typescript.ts"]:
            raw = result.decode() if isinstance(result, bytes) else result
            captured_ts.update(json.loads(raw)["files"])
        return result
    builder.subprocess.check_output = checked_output
    try:
        # The R4 receipt is historical. A live validation must not write into
        # that cohort, and staging should not depend on checkout write access.
        with tempfile.TemporaryDirectory(prefix="umf-rust-census-") as directory:
            builder.OUT = Path(directory) / "stage.json"
            original_argv = sys.argv
            try:
                sys.argv = [str(BASELINE_SCRIPT)]
                status = builder.main()
            finally:
                sys.argv = original_argv
            if status:
                return status
            data = json.loads(builder.OUT.read_text())
    finally:
        builder.subprocess.check_output = original_check_output
    payload = json.dumps(enrich(data, builder, captured_ts), ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    current = json.loads(payload)
    authority_status = current["metamodelAuthority"]["manifestDigestStatus"]
    if "--live-check" in sys.argv:
        if authority_status != "current":
            print(f"Metamodel manifest digest cohort is {authority_status}; regenerate outputs and verify them before the live census gate",
                  file=sys.stderr)
            return 1
        print(f"Live successor census validated: {len(data['sourceModules'])} modules; "
              f"{data['summary']['unresolvedModuleRows']} rows need review; metamodel fixed point still requires `bun scripts/metamodel/build.ts --check`")
        return 0
    if refuses_canonical_replace(output, authority_status, check_only="--check" in sys.argv):
        print(f"Refusing to replace the canonical R8 census with metamodel manifest digest status {authority_status}; "
              "regenerate and verify outputs first", file=sys.stderr)
        return 1
    if "--check" in sys.argv:
        current = output.read_text() if output.exists() else ""
        if current != payload:
            print(f"R4 successor census is stale: {output}", file=sys.stderr)
            if current:
                try:
                    previous = json.loads(current)
                    fresh = json.loads(payload)
                    old_modules = {item["path"]: item.get("sha256") for item in previous.get("sourceModules", [])}
                    new_modules = {item["path"]: item.get("sha256") for item in fresh.get("sourceModules", [])}
                    changed = sorted(path for path in old_modules.keys() & new_modules.keys()
                                     if old_modules[path] != new_modules[path])
                    added = sorted(new_modules.keys() - old_modules.keys())
                    removed = sorted(old_modules.keys() - new_modules.keys())
                    print(f"source cohort: {previous.get('capture', {}).get('sourceCohortSha256')} -> "
                          f"{fresh.get('capture', {}).get('sourceCohortSha256')}", file=sys.stderr)
                    print(f"changed source modules ({len(changed)}): {', '.join(changed[:20])}"
                          f"{' ...' if len(changed) > 20 else ''}", file=sys.stderr)
                    print(f"added={len(added)} removed={len(removed)}", file=sys.stderr)
                except (KeyError, TypeError, ValueError) as exc:
                    print(f"could not summarize census changes: {exc}", file=sys.stderr)
            return 1
        if not census_check_passes(current, payload, authority_status):
            print(f"R4 successor census matches a {authority_status} metamodel cohort; "
                  "regenerate and verify the metamodel before qualification", file=sys.stderr)
            return 1
        print(f"R4 successor census current: {len(data['sourceModules'])} modules; "
              f"{data['summary']['unresolvedModuleRows']} rows need review")
        return 0
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(payload, encoding="utf-8")
    label = output.relative_to(ROOT) if output.is_relative_to(ROOT) else output
    print(f"Wrote {label}: {len(data['sourceModules'])} modules; "
          f"{data['summary']['unresolvedModuleRows']} unresolved rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
