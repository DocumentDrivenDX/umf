#!/usr/bin/env python3
"""Emit a source-bound, machine-readable census for the Rust migration.

Requires Python 3.11+ to parse the repository's authored Python source.
For example: uv run --offline --no-project --python '>=3.11' python
scripts/rust-inventory.py --check. Never regenerate using an older parser.
"""
from __future__ import annotations

import ast
import fnmatch
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
if sys.version_info >= (3, 11):
    import tomllib
else:
    tomllib = None  # main refuses before any source/dependency capture.
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Earlier milestone captures remain immutable; the live gate records the R3 cohort.
OUT = ROOT / "docs/helix/04-build/evidence/rust-migration/r3/inventory.json"
TS_EXPORT = re.compile(r"(?m)^\s*export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)")
TS_IMPORT = re.compile(r"(?m)^\s*(?:import|export)\s+(?:type\s+)?(?:[^;]*?\s+from\s+)?[\"']([^\"']+)[\"']")
PY_IMPORT = re.compile(r"(?m)^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))")
FUNC_TS = re.compile(r"(?m)^\s*(?:export\s+)?(?:async\s+)?(?:function\s+([\w$]+)|(?:const|let)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^\n]*?\)|[\w$]+)\s*=>)")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_pointer_escape(component: str) -> str:
    return component.replace("~", "~0").replace("/", "~1")


def json_differences(expected: object, actual: object, pointer: str = ""):
    """Yield leaf-level JSON differences with RFC 6901 paths."""
    if isinstance(expected, dict) and isinstance(actual, dict):
        for key in sorted(expected.keys() | actual.keys()):
            path = f"{pointer}/{json_pointer_escape(str(key))}"
            if key not in expected:
                yield path, "<missing>", actual[key]
            elif key not in actual:
                yield path, expected[key], "<missing>"
            else:
                yield from json_differences(expected[key], actual[key], path)
        return
    if isinstance(expected, list) and isinstance(actual, list):
        for index in range(max(len(expected), len(actual))):
            path = f"{pointer}/{index}"
            if index >= len(expected):
                yield path, "<missing>", actual[index]
            elif index >= len(actual):
                yield path, expected[index], "<missing>"
            else:
                yield from json_differences(expected[index], actual[index], path)
        return
    if expected != actual:
        yield pointer or "", expected, actual


def compact_json(value: object, limit: int = 180) -> str:
    rendered = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if len(rendered) > limit:
        return rendered[:limit - 3] + "..."
    return rendered


def stale_inventory_diagnostics(expected: object, actual: object, limit: int = 10) -> list[str]:
    """Summarize differing sections and a bounded set of exact field changes."""
    lines = []
    sections = []
    if isinstance(expected, dict) and isinstance(actual, dict):
        sections = sorted(key for key in expected.keys() | actual.keys()
                          if expected.get(key, object()) != actual.get(key, object()))
        lines.append("Differing top-level sections: " + (", ".join(sections) if sections else "none (serialized form only)"))

    # Reserve one entry for each changed top-level section before filling the
    # remaining budget. A large early section must not hide all other drift.
    shown = []
    for section in sections:
        expected_has = section in expected
        actual_has = section in actual
        if not expected_has:
            shown.append((f"/{json_pointer_escape(str(section))}", "<missing>", actual[section]))
        elif not actual_has:
            shown.append((f"/{json_pointer_escape(str(section))}", expected[section], "<missing>"))
        else:
            for difference in json_differences(expected[section], actual[section], f"/{json_pointer_escape(str(section))}"):
                shown.append(difference)
                break

    if len(shown) > limit:
        shown = shown[:limit]
    selected = {(pointer, compact_json(old), compact_json(new)) for pointer, old, new in shown}
    has_more = False
    for difference in json_differences(expected, actual):
        identity = (difference[0], compact_json(difference[1]), compact_json(difference[2]))
        if identity in selected:
            continue
        if len(shown) == limit:
            has_more = True
            break
        shown.append(difference)
        selected.add(identity)
    for pointer, old, new in shown:
        lines.append(f"  {pointer}: expected {compact_json(old)}; actual {compact_json(new)}")
    if has_more:
        lines.append(f"  ... additional differences omitted (showing first {limit})")
    elif not shown:
        lines.append("  Parsed JSON values are equal; serialized representation differs.")
    return lines


def text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


# These are generated/install locations, not first-party source roots. A
# virtualenv may also have any user-selected name; pyvenv.cfg identifies it.
GENERATED_DIRECTORY_NAMES = frozenset({
    ".git", "node_modules", "target", "__pycache__", ".venv", ".virtualenv",
    ".virtualenvs", ".tox", ".nox", "site-packages", "dist-packages",
})


def generated_path(path: Path) -> bool:
    """Check lexical paths AND resolved destinations before admitting files."""
    try:
        parts = path.relative_to(ROOT).parts
    except ValueError:
        return True
    directories = parts if path.is_dir() else parts[:-1]
    if any(part in GENERATED_DIRECTORY_NAMES for part in directories):
        return True
    if any(directories[i:i + 2] == ("wasm", "pkg")
           for i in range(len(directories) - 1)):
        return True
    current = path if path.is_dir() else path.parent
    while current != ROOT:
        if (current / "pyvenv.cfg").is_file():
            return True
        current = current.parent
    return False


def tracked_or_existing(paths: list[Path]) -> list[Path]:
    selected = set()
    for path in paths:
        # Filter before resolve: a .venv symlink to authored source must not
        # enter via an environment path, nor source aliases to installed code.
        if not path.is_file() or generated_path(path):
            continue
        resolved = path.resolve()
        if ROOT in resolved.parents and not generated_path(resolved):
            selected.add(resolved)
    return sorted(selected)


def source_files(bases: list[Path], suffixes: set[str] | None = None) -> list[Path]:
    paths = []
    for base in bases:
        if not base.is_dir() or generated_path(base):
            continue
        for directory, subdirectories, names in os.walk(base, followlinks=False):
            current = Path(directory)
            subdirectories[:] = sorted(name for name in subdirectories
                                       if not generated_path(current / name)
                                       and not generated_path((current / name).resolve()))
            paths.extend(current / name for name in names
                         if suffixes is None or Path(name).suffix in suffixes)
    return tracked_or_existing(paths)


def parse_python_source(path: Path, source: str) -> ast.Module:
    try:
        return ast.parse(source, filename=str(path))
    except SyntaxError as error:
        raise RuntimeError(
            f"Cannot census Python source {path}: {error.msg} at line {error.lineno}. "
            "Use an interpreter supporting this source; inventory never silently omits syntax."
        ) from error


def ts_symbols(source: str) -> list[str]:
    names = set(TS_EXPORT.findall(source))
    for line in source.splitlines():
        if line.lstrip().startswith("export {"):
            names.update(re.findall(r"\b([A-Za-z_$][\w$]*)\s*(?:as\s+[A-Za-z_$][\w$]*)?", line))
    return sorted(names - {"export", "type"})


def py_symbols(path: Path, source: str) -> list[str]:
    tree = parse_python_source(path, source)
    exports = None
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "__all__" for t in node.targets):
            try:
                exports = ast.literal_eval(node.value)
            except (ValueError, TypeError):
                pass
    if isinstance(exports, (list, tuple)):
        return sorted(str(x) for x in exports)
    return sorted(n.name for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and not n.name.startswith("_"))


def source_disposition(path: str) -> tuple[str, str]:
    if path.startswith("src/model/") or path.startswith("src/validation/") or path.startswith("src/registry/"):
        return "shared-semantic-engine", "R5 or R2 migration obligation; preserve contract and generated authority"
    if path.startswith("src/access/") or path.startswith("src/compilation/") or path.startswith("src/table-deployment/") or path.startswith("src/table-migration/"):
        return "shared-generator-or-planner", "R3 port candidate; host presentation and generated boundary stay explicit"
    if path.startswith("src/domain-packs/"):
        if path.endswith("loader-contract.ts"):
            return "domain-pack-public-contract", "R5 preserve loader API and keep source acquisition/consumer execution separately qualified"
        if path.endswith("loader-inventory.ts"):
            return "domain-pack-generated-inventory", "R5 preserve source and digest provenance; owner of generation must be confirmed from provenance"
        return "domain-pack-tooling-and-admission", "R5 migrate portable pack admission/preservation; data sources and consumer I/O remain explicit"
    if path.startswith("src/generated/"):
        return "generated-metamodel-output", "ADR-005 authored metamodel remains authority; R2 replace compiler/validator execution without editing generated rules"
    if path == "src/index.ts":
        return "typescript-public-api-facade", "R2/R5 preserve public operations while operation families move in qualified slices"
    if path.startswith("src/types/"):
        return "host-type-declaration", "R5 preserve browser boundary declarations and remove only with corresponding family retirement"
    if path.startswith("src/adapters/") or path.startswith("src/projections/") or path.startswith("src/core-ideals/") or path.startswith("src/extensions/"):
        return "shared-adapter-or-extension", "R5 individual family qualification required"
    if path.startswith("python/umf_codegen/"):
        return "python-codegen-wrapper-or-writer", "R3/R4; dispatch is currently embedded V8 and writer remains host I/O"
    if path.startswith("python/umf_access/src/umf_access/"):
        name = path.removeprefix("python/umf_access/src/umf_access/")
        explicit = {
            "__init__.py": ("python-public-package-surface", "R6 preserve package imports and declared public names"),
            "adoption.py": ("adoption-and-compatibility-checks", "R6 migrate UMF-owned request and compatibility algorithms"),
            "bulk.py": ("shared-bulk-planning", "R6 move portable bulk planning; retain transport and transaction host"),
            "capture.py": ("host-native-capture", "R6 host driver/catalog capture glue; Rust consumes explicit captured data"),
            "catalog.py": ("shared-catalog-admission", "R6 move portable catalog admission and integrity algorithms"),
            "codec_support.py": ("shared-value-codecs", "R2/R6 move shared typed codecs while retaining host model presentation"),
            "commands.py": ("shared-command-planning", "R6 move portable command construction and verification"),
            "delta_read.py": ("host-delta-reader", "R6 retain storage/session integration; classify embedded planning separately"),
            "engine_catalog.py": ("shared-engine-catalog", "R6 move portable engine/catalog validation"),
            "generated_core.py": ("generated-data", "ADR-005 derived generated core data; keep authority in the metamodel"),
            "manifest_commands.py": ("shared-manifest-planning", "R6 move portable manifest command algorithms"),
            "native_actions.py": ("host-native-action-adapter", "R6 retain driver and transaction boundary; move reusable plan semantics"),
            "native_program.py": ("shared-native-program-model", "R6 move portable program interpretation; preserve explicit native boundary"),
            "pages.py": ("host-pagination", "R6 retain host cursor/transport lifecycle"),
            "postgres_bulk.py": ("host-postgresql-bulk-adapter", "R6 host DBAPI/transaction execution"),
            "postgres_read.py": ("host-postgresql-read-adapter", "R6 host DBAPI/session execution"),
            "postgres_search.py": ("host-postgresql-search-adapter", "R6 host DBAPI/session execution"),
            "protocols.py": ("binding-protocols", "R6 preserve consumer-owned executor/transport interfaces"),
            "related_keys.py": ("shared-related-key-planning", "R6 move portable relationship key selection and checks"),
            "reviewed.py": ("shared-reviewed-plan-validation", "R6 move portable verification; caller authorization remains host-owned"),
            "search_catalog.py": ("shared-search-catalog", "R6 move portable search catalog admission"),
            "targets.py": ("shared-target-resolution", "R6 move portable target/engine resolution"),
            "types.py": ("host-value-shapes", "R2/R6 preserve Python ergonomic and exact host-value admission boundary"),
            "unity_search.py": ("host-managed-search-adapter", "R6 retain managed engine/session execution"),
            "values.py": ("shared-value-semantics", "R2/R6 move shared exact value rules behind host admission"),
            "verification.py": ("shared-verification", "R6 move portable request/report verification"),
        }
        if name in explicit:
            return explicit[name]
        if name.startswith("build/"):
            if name in {"build/__init__.py"}:
                return "build-package-surface", "R6 preserve build API imports"
            if name in {"build/pg_privileges.py", "build/privileges.py"}:
                return "host-privilege-introspection", "R6 keep database catalog and privilege observation in host adapter"
            return "shared-build-planner", "R6 migrate portable catalog/SQL plan generation; host execution remains external"
        if name.startswith("dsl/"):
            return ("generated-client-dsl", "R6 preserve client expression ergonomics; move shared query validation/rendering after parity")
        if name.startswith("lifecycle/"):
            if name in {"lifecycle/__init__.py", "lifecycle/catalog.py", "lifecycle/ledger_schema.py", "lifecycle/outcome_schema.py", "lifecycle/table_boundary.py"}:
                return "lifecycle-model-and-schema", "R6 migrate portable lifecycle admission/planning; preserve inert source and host boundary"
            if name in {"lifecycle/probe.py", "lifecycle/roles.py", "lifecycle/privileges.py"}:
                return "host-lifecycle-observation", "R6 retain database role/catalog probes in host adapter"
            return "lifecycle-plan-or-executor", "R6 move portable lifecycle validation; keep transaction, authorization and storage in host"
        if name in {"managed_actions.py", "managed_bulk.py", "managed_delta.py", "managed_support.py"}:
            return "managed-host-adapter", "R6 host managed-engine calls and transactions stay in Python; portable admission/planning moves to Rust"
        if name.startswith("unified/"):
            if name in {"unified/__init__.py", "unified/_binding.py", "unified/session_binding.py", "unified/native_binding.py", "unified/session_async.py", "unified/session_sync.py", "unified/session_psycopg2.py", "unified/session_sqlalchemy.py"}:
                return "host-session-binding", "R6 retain driver session, transaction, async and cancellation glue"
            return "shared-unified-value-or-operation", "R6 migrate portable row/value/admission algorithms; retain driver execution in binding modules"
        if name == "dsl/__init__.py":
            return "generated-client-dsl", "R6 preserve Python client expression surface"
        return "python-access-explicit-review", "R0 semantic owner needs a named disposition before its migration slice can close"
    if path.startswith("python/src/umf/"):
        name = path.removeprefix("python/src/umf/")
        explicit = {
            "_rust.py": ("production-python-rust-host-boundary", "R2 strict host admission, immutable resource loading, callback/token and exact diagnostic transport; installed qualification required"),
            "__init__.py": ("python-public-core-surface", "R2/R4 preserve public imports and behavior during cutover"),
            "constraint_kernel.py": ("rust-constraint-compatibility-delegate", "R2 native delegation implemented; require installed program/policy parity before closure"),
            "generated_resources.py": ("generated-data-loader", "R2/R4 retain ADR-005-derived resources and standard Python package loading"),
            "json.py": ("python-native-json-admission", "R2 port or bind exact source admission with Python host-value preservation"),
            "literal_kernel.py": ("rust-literal-compatibility-delegate", "R2 native literal/interval delegation implemented; require exact policy and host parity before closure"),
            "models.py": ("python-model-presentation", "R2 preserve Pydantic/public shapes while shared admission moves to Rust"),
            "registry.py": ("python-registry-binding", "R2 preserve callback/resource host capability registration"),
            "schemas.py": ("python-schema-presentation", "R2 retain schema API and generated shapes; generic validation moves to Rust"),
            "serialization.py": ("python-serialization-boundary", "R2 preserve exact host values and public serialization behavior"),
            "validation.py": ("python-validation-binding", "R2 preserve Python diagnostics/callback API around shared Rust validation"),
        }
        return explicit.get(name, ("python-core-explicit-review", "R0 semantic owner needs a named disposition before migration closure"))
    return "unclassified", "human disposition required before migration closure"


def module_record(path: Path) -> dict[str, object]:
    source = text(path)
    p = rel(path)
    if p.endswith(".ts"):
        imports = sorted(set(TS_IMPORT.findall(source)))
        exports = ts_symbols(source)
        lang = "typescript"
    else:
        imports = sorted({a or b for a, b in PY_IMPORT.findall(source)})
        exports = py_symbols(path, source)
        lang = "python"
        resolved = []
        try:
            tree = parse_python_source(path, source)
            module_root = next((marker for marker in ("/src/umf/", "/src/umf_access/", "/src/umf_codegen/") if marker in path.as_posix()), None)
            if module_root:
                root_text = path.as_posix().split(module_root, 1)[0] + module_root.strip("/")
                root_path = Path(root_text)
                module_index = path.relative_to(root_path)
                module_parts = list(module_index.with_suffix("").parts)
                is_package_init = module_parts[-1] == "__init__"
                if is_package_init:
                    module_parts.pop()
                package_parts = module_parts if is_package_init else module_parts[:-1]
                for node in ast.walk(tree):
                    target = None
                    if isinstance(node, ast.ImportFrom):
                        base = package_parts[:len(package_parts) - node.level + 1] if node.level else []
                        if node.module:
                            base.extend(node.module.split("."))
                        target = ".".join(base)
                    elif isinstance(node, ast.Import):
                        for alias in node.names:
                            if (root_path.joinpath(*alias.name.split(".")).with_suffix(".py").exists() or root_path.joinpath(*alias.name.split("."), "__init__.py").exists()):
                                resolved.append(alias.name)
                    if target and (root_path.joinpath(*target.split(".")).with_suffix(".py").exists() or root_path.joinpath(*target.split("."), "__init__.py").exists()):
                        resolved.append(target)
        except ValueError:
            pass
        resolved_imports = sorted(set(resolved))
    disposition, obligation = source_disposition(p)
    record = {"path": p, "language": lang, "sha256": sha(path.read_bytes()), "bytes": path.stat().st_size,
            "publicExports": exports, "imports": imports, "disposition": disposition,
            "migrationObligation": obligation}
    if lang == "python":
        record["resolvedInternalImports"] = resolved_imports
    return record


def algorithm_names(path: Path, source: str) -> list[str]:
    if path.suffix == ".py":
        tree = parse_python_source(path, source)
        return sorted(n.name for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)))
    return sorted(set(a or b for a, b in FUNC_TS.findall(source)))


def rust_module_disposition(path: str) -> tuple[str, str]:
    if path.startswith("crates/umf-core/vendor/saphyr-parser/"):
        return "vendored-shared-yaml-parser", "R2 pinned saphyr-parser 0.1.0 with reviewed default/Python scanner profiles; preserve upstream source identity, licenses and native/WASM qualification"
    if path.startswith(("crates/umf-core/", "crates/umf-metamodel/")):
        return "production-host-free-rust-engine", "R2 full independent compiler/core conformance and metered resource qualification required"
    if path.startswith("crates/umf-codegen/"):
        return "production-host-free-rust-codegen", "R3 full generator/IR/emission/hash and lifecycle semantic closure; frozen predecessor, installed-host and resource qualification required before completion"
    if path.startswith("crates/umf-core-wire/"):
        return "production-private-value-transport", "R2 closed UTF16 wire; strict admission before allocation and no semantic fallback"
    if path.startswith(("bindings/core/", "crates/umf-cli/")):
        return "production-host-binding", "R2 installed target-specific compatibility, callback and resource evidence required"

    if path.startswith("crates/rust-spike-core/"):
        return "host-free-shared-rust-spike", "R1 prototype only; close only with source-bound conformance and target-qualified dependency evidence"
    if path.startswith("crates/rust-spike-cli/"):
        return "rust-cli-host-adapter", "R1 CLI binding; retain process/argument/environment integration at host edge"
    if path.startswith("bindings/rust-spike/"):
        return "rust-language-binding-host-adapter", "R1 binding glue; keep runtime-specific imports in the corresponding host adapter"
    return "rust-spike-workspace-support", "R1 build or test support; individual migration disposition required before closure"


def rust_build_inputs() -> list[dict[str, object]]:
    """Bind embedded data, licenses and build inputs, not generated artifacts."""
    inputs = [ROOT / name for name in ("rust-toolchain.toml", ".cargo/config.toml")]
    for base in (ROOT / "crates", ROOT / "bindings"):
        if not base.exists():
            continue
        for path in source_files([base]):
            if not path.is_file() or path.suffix == ".rs":
                continue
            parts = path.relative_to(ROOT).parts
            if any(part in ("target", "node_modules", ".git", "__pycache__") for part in parts):
                continue
            if any(parts[i:i + 2] == ("wasm", "pkg") for i in range(len(parts) - 1)):
                continue
            if path.suffix in (".node", ".so", ".dylib", ".dll", ".wasm", ".pyd", ".pyc"):
                continue
            inputs.append(path)
    return [{"path": rel(path), "sha256": sha(path.read_bytes()), "bytes": path.stat().st_size}
            for path in tracked_or_existing(inputs)]


def python_console_entrypoint_roots(pyprojects: list[Path], source_paths: list[Path]) -> dict[str, set[str]]:
    """Resolve declared Python console scripts to their authored module files."""
    authored = {path.resolve() for path in source_paths}
    roots: dict[str, set[str]] = {}
    for manifest in pyprojects:
        data = tomllib.loads(text(manifest))
        scripts = data.get("project", {}).get("scripts", {})
        if not isinstance(scripts, dict):
            continue
        source_root = manifest.parent / "src"
        for command, target in scripts.items():
            if not isinstance(command, str) or not isinstance(target, str):
                continue
            # Only map standard module:callable entry points. Dynamic import
            # syntax remains visible in the manifest but is not guessed here.
            target_match = re.fullmatch(
                r"([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*):([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)",
                target, flags=re.ASCII)
            if not target_match:
                continue
            module = target_match.group(1)
            module_path = source_root.joinpath(*module.split(".")).with_suffix(".py").resolve()
            if module_path in authored:
                roots.setdefault(rel(module_path), set()).add(
                    f"project.scripts:{command} ({rel(manifest)})")
    return roots


def workflow_unittest_discovery_roots(workflow_runs: dict[str, list[str]], source_paths: list[Path]) -> tuple[dict[str, set[str]], list[dict[str, str]]]:
    """Resolve bounded `python -m unittest discover -s DIR -p PATTERN` roots."""
    authored = [path.resolve() for path in source_paths]
    roots: dict[str, set[str]] = {}
    unresolved: list[dict[str, str]] = []
    for workflow, run_values in workflow_runs.items():
        if ".github/workflows/" not in workflow:
            continue
        for run_value in run_values:
            logical_lines = run_value.splitlines()
            if len(logical_lines) > 1:
                if re.search(r"python(?:3(?:\.\d+)?)?\s+(?:-I\s+)?-m\s+unittest\s+discover(?:\s|$)",
                             run_value, flags=re.ASCII):
                    unresolved.append({"workflow": workflow, "commandSha256": sha(run_value.encode("utf-8")),
                                       "reason": "multiline-unittest-discovery-run-block-not-admitted"})
                continue
            for command in logical_lines:
                try:
                    tokens = shlex.split(command, comments=True)
                except ValueError:
                    if re.match(r"^python(?:3(?:\.\d+)?)?\s+(?:-I\s+)?-m\s+unittest\s+discover(?:\s|$)", command.strip(), flags=re.ASCII):
                        unresolved.append({"workflow": workflow, "commandSha256": sha(command.encode("utf-8")),
                                           "reason": "malformed-unittest-discovery-command"})
                    break
                if not tokens or not re.fullmatch(r"python(?:3(?:\.\d+)?)?", tokens[0], flags=re.ASCII):
                    continue
                index = 1
                if index < len(tokens) and tokens[index] == "-I":
                    index += 1
                if tokens[index:index + 3] != ["-m", "unittest", "discover"]:
                    continue

                def refuse(reason: str) -> None:
                    unresolved.append({"workflow": workflow, "commandSha256": sha(command.encode("utf-8")), "reason": reason})

                arguments = tokens[index + 3:]
                start = None
                pattern = "test*.py"
                pattern_explicit = False
                index = 0
                while index < len(arguments):
                    token = arguments[index]
                    if token in {"-v", "--verbose", "-q", "--quiet"}:
                        index += 1
                        continue
                    if token not in {"-s", "--start-directory", "-p", "--pattern"} or index + 1 >= len(arguments):
                        break
                    value = arguments[index + 1]
                    if token in {"-s", "--start-directory"}:
                        if start is not None:
                            break
                        start = value
                    else:
                        if pattern_explicit:
                            break
                        pattern = value
                        pattern_explicit = True
                    index += 2
                if index != len(arguments) or start is None:
                    refuse("unsupported-or-incomplete-unittest-discovery-options")
                    continue
                if Path(start).is_absolute() or ".." in Path(start).parts or not start.strip() or Path(start) == Path("."):
                    refuse("unbounded-or-out-of-root-unittest-start-directory")
                    continue
                if Path(pattern).name != pattern or not pattern.strip() or pattern in {"*", "*.py"}:
                    refuse("unbounded-or-invalid-unittest-pattern")
                    continue
                start_path = (ROOT / start).resolve()
                if ROOT not in start_path.parents and start_path != ROOT:
                    refuse("unittest-start-directory-resolves-outside-repository")
                    continue
                evidence = f"workflow:{workflow} unittest discover -s {start} -p {pattern}"
                for candidate in authored:
                    try:
                        candidate.relative_to(start_path)
                    except ValueError:
                        continue
                    if fnmatch.fnmatchcase(candidate.name, pattern):
                        roots.setdefault(rel(candidate), set()).add(evidence)
    return roots, sorted(unresolved, key=lambda item: (item["workflow"], item["commandSha256"], item["reason"]))


def rust_module_record(path: Path) -> dict[str, object]:
    source = text(path)
    p = rel(path)
    names = sorted(set(re.findall(r"(?m)^\s*pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const|static)\s+([A-Za-z_][A-Za-z0-9_]*)", source)))
    disposition, obligation = rust_module_disposition(p)
    return {"path": p, "language": "rust", "sha256": sha(path.read_bytes()), "bytes": path.stat().st_size,
            "publicExports": names, "imports": sorted(set(re.findall(r"(?m)^\s*use\s+([^;]+);", source))),
            "disposition": disposition, "migrationObligation": obligation}


def script_disposition(path: str, active: bool) -> tuple[str, str]:
    if path.startswith("bindings/core/"):
        return "production-rust-host-glue", "R2 host descriptor admission/loading/callback transport only; Rust owns shared semantics; installed target evidence required"
    if path.startswith("scripts/metamodel/"):
        return "rust-compiler-build-host-bridge", "R2 native compiler process/provenance plus explicit third-party Ajv build backend; no UMF compiler fallback"

    if path.startswith("tests/") or path.startswith("python/") and "/tests/" in path:
        return ("test-oracle-fixture-algorithm", "Active only where activation evidence says so; test/oracle logic is evidence and not an implementation port by default") if active else ("unreferenced-test-source", "Retained test/evidence source with no discovered current activation edge")
    if path.startswith("docs/helix/05-deploy/"):
        return ("deployed-reference-ui-or-build", "R7 browser/UI or generated-reference tooling; shared model computation remains migration scope") if active else ("unreferenced-deploy-tool", "No current activation edge discovered")
    if path.startswith("tools/security/"):
        return ("security-evidence-harness", "Active security oracle/harness; retain its independent authority and source identity") if active else ("unreferenced-security-source", "No current activation edge discovered")
    return ("active-host-tooling-algorithm", "Active build/test/CLI tooling; individually review any UMF semantic algorithm before declaring a host-only boundary") if active else ("unreferenced-script-source", "No current package/workflow/import activation edge discovered")


def bun_closure(package: dict[str, object], lock: dict[str, object]) -> list[dict[str, object]]:
    packages = lock.get("packages", {})
    roots = {}
    roots.update({name: (specifier, "runtime") for name, specifier in package.get("dependencies", {}).items()})
    roots.update({name: (specifier, "build-test") for name, specifier in package.get("devDependencies", {}).items()})
    name_to_key: dict[str, list[str]] = {}
    for key, value in packages.items():
        # Lock keys are package identities such as name@version or @scope/name@version.
        ident = value[0]
        if ident.startswith("@"):
            name, _, version = ident.rpartition("@")
        else:
            name, _, version = ident.partition("@")
        name_to_key.setdefault(name, []).append(key)
    output: dict[str, dict[str, object]] = {}
    todo: list[tuple[str, str, str, str, str]] = [(name, specifier, "direct", category, name) for name, (specifier, category) in roots.items()]
    seen: set[tuple[str, str]] = set()
    while todo:
        name, requested, kind, category, origin_root = todo.pop(0)
        resolved_name = name
        resolved_request = requested
        alias_target = None
        if requested.startswith("npm:"):
            alias_target = requested.removeprefix("npm:")
            resolved_name, _, resolved_request = alias_target.rpartition("@")
        candidates = name_to_key.get(resolved_name, [])
        key = next((x for x in candidates if packages[x][0].endswith("@" + resolved_request)), candidates[0] if candidates else None)
        if key is None:
            optional_peer = kind == "transitive:peerDependencies"
            output[f"{name}@{requested}"] = {"name": name, "requested": requested, "resolution": "optional-peer-not-locked" if optional_peer else "missing-from-lock", "edge": kind,
                                              "migrationDisposition": "optional peer not present in lock closure; feature-specific use is not established" if optional_peer else "unresolved dependency must be dispositioned before migration closure"}
            continue
        record = packages[key]
        ident, _, metadata = record[0], record[0], record[2] if len(record) > 2 and isinstance(record[2], dict) else {}
        if ident not in output:
            if ident.startswith("@"):
                resolved_name, _, version = ident.rpartition("@")
            else:
                resolved_name, _, version = ident.partition("@")
            output[ident] = {"name": resolved_name, "version": version, "resolution": "locked", "alias": name if alias_target else None,
                             "directSpecifiers": [], "origins": [], "dependencies": []}
        origin = {"root": origin_root, "category": category, "edge": kind}
        if origin not in output[ident]["origins"]:
            output[ident]["origins"].append(origin)
        if kind == "direct":
            direct = {"name": name, "specifier": requested, "category": category, "resolvedAlias": resolved_name if alias_target else None}
            if direct not in output[ident]["directSpecifiers"]:
                output[ident]["directSpecifiers"].append(direct)
        output[ident]["migrationDisposition"] = dependency_disposition(output[ident]["name"], output[ident]["origins"])
        edge_key = (ident, category)
        if edge_key in seen:
            continue
        seen.add(edge_key)
        dep_names = set()
        for group_name in ("dependencies", "optionalDependencies", "peerDependencies"):
            for dep, spec in (metadata.get(group_name) or {}).items():
                dep_names.add(dep)
                todo.append((dep, str(spec), f"transitive:{group_name}", category, origin_root))
        output[ident]["dependencies"] = sorted(dep_names)
    return [output[k] for k in sorted(output)]


def python_project_declarations(project_data: dict[str, object], project_path: str) -> list[dict[str, object]]:
    project = project_data.get("project", {})
    declarations = []
    def add(requirement: str, group: str, kind: str) -> None:
        match = re.match(r"\s*([A-Za-z0-9_.-]+)", requirement)
        if not match:
            raise RuntimeError(f"Cannot parse declared Python requirement {requirement!r} in {project_path}")
        declarations.append({"project": project_path, "projectName": project.get("name"), "group": group,
                             "requirement": requirement, "package": match.group(1), "kind": kind,
                             "resolution": "unlocked", "migrationDisposition": "declared requirement; selected versions are separately recorded in the target-specific uv resolution snapshot"})
    for requirement in project.get("dependencies", []):
        add(requirement, "project.dependencies", "runtime")
    for group, requirements in sorted(project.get("optional-dependencies", {}).items()):
        for requirement in requirements:
            add(requirement, f"project.optional-dependencies.{group}", "optional")
    for group, requirements in sorted(project_data.get("dependency-groups", {}).items()):
        for requirement in requirements:
            add(requirement, f"dependency-groups.{group}", "development")
    build = project_data.get("build-system", {})
    for requirement in build.get("requires", []):
        add(requirement, "build-system.requires", "build-requirement")
    # build-system.build-backend is an entry point, not a package requirement.
    return declarations


def dependency_disposition(name: str, origins: list[dict[str, object]]) -> str:
    if name.startswith("@typespec/") or name == "@typespec/compiler":
        family = "TypeSpec compiler and emitter toolchain"
    elif name in {"ajv", "ajv-draft-04"}:
        family = "JSON Schema validators"
    elif name in {"@bufbuild/protobuf", "@launchql/protobufjs", "protobufjs"}:
        family = "Protobuf runtime/compiler support"
    elif name in {"yaml"}:
        family = "YAML parser/stringifier"
    elif name in {"graphql"}:
        family = "GraphQL parser/runtime"
    elif name in {"avsc"}:
        family = "Avro runtime"
    elif name in {"jsonld", "n3", "rdf-literal", "rdf-validate-shacl", "rdfxml-streaming-parser"}:
        family = "RDF/JSON-LD/SHACL parser and semantic packages"
    elif name in {"apache-arrow", "hyparquet", "flatbuffers"}:
        family = "Arrow/Parquet/binary format packages"
    elif name in {"@libpg-query/parser"}:
        family = "PostgreSQL SQL parser"
    else:
        family = "transitive utility or tooling package; inspect each import/lock origin before removal"
    categories = sorted({str(origin["category"]) for origin in origins})
    if "runtime" in categories:
        return f"{family}; present in production dependency closure, replace or explicitly retain with versioned family evidence"
    return f"{family}; build/test dependency closure, keep while an active tool or test imports it"


def main() -> int:
    if sys.version_info < (3, 11):
        print("Rust inventory requires Python 3.11 or newer to census authored syntax; "
              "run with a qualified interpreter, for example: "
              "uv run --offline --no-project --python '>=3.11' python scripts/rust-inventory.py --check",
              file=sys.stderr)
        return 2
    ts_capture = json.loads(subprocess.check_output(["bun", "scripts/rust-inventory-typescript.ts"], cwd=ROOT, text=True))
    package = json.loads((ROOT / "package.json").read_text())
    # Bun lock uses JSON with trailing commas.
    lock_text = (ROOT / "bun.lock").read_text()
    lock = json.loads(re.sub(r",\s*([}\]])", r"\1", lock_text))
    source_paths = sorted(source_files([ROOT / "src"], {".ts"}) + source_files([
        ROOT / "python/src", ROOT / "python/umf_access/src", ROOT / "python/umf_codegen/src",
    ], {".py"}))
    modules = [module_record(p) for p in source_paths]
    for module in modules:
        captured = ts_capture["files"].get(module["path"])
        if module["language"] == "typescript":
            if captured is None:
                raise RuntimeError(f"TypeScript compiler did not load active source module: {module['path']}")
            module["publicExports"] = captured["publicExports"]
            module["imports"] = captured["imports"]
            module["resolvedImports"] = captured["resolvedImports"]
    code_roots = [ROOT / "scripts", ROOT / "tests", ROOT / "tools", ROOT / "docs/helix/05-deploy/schema-browser", ROOT / "python", ROOT / "bindings"]
    all_script_paths = source_files(code_roots, {".ts", ".py", ".js", ".mjs", ".cjs"})
    activation_files = [ROOT / "package.json", *sorted((ROOT / ".github/workflows").glob("*.yml")), ROOT / ".githooks/pre-commit"]
    activation_text = "\n".join(text(p) for p in activation_files if p.exists())
    roots = set()
    root_activation_evidence: dict[str, set[str]] = {}
    python_manifests = sorted((ROOT / "python").glob("*/pyproject.toml"))
    python_entrypoints = python_console_entrypoint_roots(python_manifests, all_script_paths)
    unittest_discovery, unresolved_workflow_activations = workflow_unittest_discovery_roots(
        ts_capture.get("workflowRuns", {}), all_script_paths)
    for activated in (python_entrypoints, unittest_discovery):
        for path, evidence in activated.items():
            roots.add(path)
            root_activation_evidence.setdefault(path, set()).update(evidence)
    # Capture executable first-party paths mentioned by package scripts, workflow commands and hooks.
    for match in re.findall(r"(?:scripts|tests|tools|python|bindings|docs/helix/05-deploy/schema-browser)/[A-Za-z0-9_./-]+\.(?:ts|py|js|mjs|cjs)", activation_text):
        candidate = match.removeprefix("./")
        if candidate.startswith(("scripts/", "tests/", "tools/", "docs/helix/05-deploy/", "python/")) and (ROOT / candidate).is_file():
            roots.add(candidate)
    for match in re.findall(r"(?m)\bbun\s+test\s+(tests/[A-Za-z0-9_./*-]+)", activation_text):
        test_dir = ROOT / match.rstrip("/*")
        if test_dir.is_dir():
            roots.update(rel(path) for path in all_script_paths if path.is_relative_to(test_dir))
    ts_script_imports = {name: data["resolvedImports"] for name, data in ts_capture["files"].items()}
    script_paths_by_stem: dict[str, list[str]] = {}
    for path in all_script_paths:
        script_paths_by_stem.setdefault(path.stem, []).append(rel(path))
    reachable = set(roots)
    unknown_activation_roots = []
    for command in re.findall(r"(?m)(?:^|\s)(?:bun|python(?:3)?|node|tsx)\s+(?:-I\s+)?((?:scripts|tests|tools|python|bindings|docs/helix/05-deploy/schema-browser)/[A-Za-z0-9_./-]+\.(?:ts|py|js|mjs|cjs))", activation_text):
        if (ROOT / command).is_file():
            roots.add(command)
            reachable.add(command)
        else:
            unknown_activation_roots.append(command)
    script_relative_paths = {rel(p) for p in all_script_paths}
    queue = list(roots)
    while queue:
        current = queue.pop()
        imported = list(ts_script_imports.get(current, []))
        source_path = ROOT / current
        if source_path.suffix == ".py":
            tree = parse_python_source(source_path, text(source_path))
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    imported.extend(script_paths_by_stem.get(node.module.rsplit(".", 1)[-1], []))
                elif isinstance(node, ast.Import):
                    for alias in node.names:
                        imported.extend(script_paths_by_stem.get(alias.name.rsplit(".", 1)[-1], []))
        for path in imported:
            if path in script_relative_paths and path not in reachable:
                reachable.add(path)
                queue.append(path)
    scripts = []
    for path in all_script_paths:
        p = rel(path)
        source = text(path)
        active_matches = [rel(file) for file in activation_files if file.exists() and re.search(r"(?:^|[\s'\"`])" + re.escape(p) + r"(?:$|[\s'\"`])", text(file))]
        internal_matches = [parent for parent in reachable if parent != p and p in (ts_script_imports.get(parent, []) if parent.endswith(".ts") else [])]
        active = p in reachable
        disposition, obligation = script_disposition(p, active)
        scripts.append({"path": p, "language": path.suffix.lstrip("."), "sha256": sha(path.read_bytes()), "bytes": path.stat().st_size,
                        "active": active, "activationEvidence": sorted(set(active_matches + internal_matches + list(root_activation_evidence.get(p, set())) + (["transitive-import-closure"] if active and not active_matches and p not in root_activation_evidence else []))),
                        "algorithmSymbols": algorithm_names(path, source),
                        "disposition": disposition, "migrationObligation": obligation})
    pyprojects = []
    py_direct = []
    py_resolution = []
    resolver_dir = ROOT / "docs/helix/04-build/evidence/rust-migration/r0"
    for project, filename in [("umf-core", "python-core-macos-arm64-py311.txt"),
                              ("umf_access", "python-access-macos-arm64-py311.txt"),
                              ("umf-codegen", "python-codegen-macos-arm64-py311.txt")]:
        snapshot = resolver_dir / filename
        if snapshot.exists():
            py_resolution.append({"project": project, "path": rel(snapshot), "sha256": sha(snapshot.read_bytes()),
                                  "target": "aarch64-apple-darwin / CPython 3.11", "kind": "non-installing uv resolution snapshot; candidate versions and hashes, not repository lock or installed qualification"})
    for path in tracked_or_existing(sorted((ROOT / "python").glob("*/pyproject.toml")) + [ROOT / "python/pyproject.toml"]):
        if path.exists():
            source = text(path)
            pyprojects.append({"path": rel(path), "sha256": sha(path.read_bytes()), "text": source})
            project_data = tomllib.loads(source)
            py_direct.extend(python_project_declarations(project_data, rel(path)))
    rust_paths = source_files([ROOT / "crates", ROOT / "bindings"], {".rs"})
    rust_modules = [rust_module_record(p) for p in rust_paths]
    rust_inputs = rust_build_inputs()
    result = {
        "schema": "umf.rust-migration-inventory/0.2",
        "capture": {"inventoryFormat": "0.2", "inventoryScript": rel(Path(__file__).resolve()),
                    "typescriptApi": ts_capture["typescriptVersion"], "sourceCohortSha256": sha(("\n".join(f"{m['path']} {m['sha256']}" for m in modules) + "\n" + "\n".join(f"{s['path']} {s['sha256']}" for s in scripts) + "\n" + "\n".join(f"{m['path']} {m['sha256']}" for m in rust_modules) + "\n" + "\n".join(f"{m['path']} {m['sha256']}" for m in rust_inputs) + "\n" + "\n".join(f"{p['path']} {p['sha256']}" for p in pyprojects) + "\n" + sha((ROOT / "Cargo.lock").read_bytes()) + "\n" + sha((ROOT / "Cargo.toml").read_bytes()) + "\n" + sha((ROOT / "package.json").read_bytes()) + "\n" + sha((ROOT / "bun.lock").read_bytes())).encode())},
        "counts": {"sourceModules": len(modules), "rustModules": len(rust_modules), "rustBuildInputs": len(rust_inputs), "typescriptModules": sum(m["language"] == "typescript" for m in modules),
                   "pythonModules": sum(m["language"] == "python" for m in modules), "scriptFiles": len(scripts),
                   "activeScriptFiles": sum(s["active"] for s in scripts), "algorithmSymbols": sum(len(s["algorithmSymbols"]) for s in scripts)},
        "sourceModules": modules,
        "rustModules": rust_modules,
        "rustBuildInputs": rust_inputs,
        "scripts": scripts,
        "dependencies": {"javascript": {"direct": package.get("dependencies", {}), "devDirect": package.get("devDependencies", {}),
                                             "lockfileSha256": sha((ROOT / "bun.lock").read_bytes()), "resolvedClosure": bun_closure(package, lock),
                                             "dispositionPolicy": "each resolved package is retained as a named migration input; family owners must be assigned before its closure can be retired"},
                          "python": {"lockfile": None, "status": "direct declarations captured; repository has no Python lock; separate non-installing resolver snapshots capture candidate closure for one target", "projects": pyprojects,
                                     "directDeclarations": py_direct, "resolverSnapshots": py_resolution}},
        "operations": [
            {"id": "discover_changes", "publicApi": "umf_codegen.discover_table_migration_changes", "bridge": "__umf_table_migration_changes", "source": ["scripts/codegen/entry.ts", "src/table-migration/reviewed.ts"], "baseline": None, "migrationDisposition": "R3/R4; added by integrated main PR41 after R0 historical capture; upstream installed evidence under praxis-u123-adoption, new independent Rust baseline still required before port"},
            {"id": "row_scope", "publicApi": "umf_codegen.normalize_row_scope", "bridge": "__umf_row_scope", "source": ["scripts/codegen/entry.ts", "src/table-authoring/row-scope.ts"], "baseline": None, "migrationDisposition": "R3/R4; added by integrated main PR41 after R0 historical capture; upstream row-scope corpus retained, new independent Rust baseline still required before port"},
            {"id": "generate", "publicApi": "umf_codegen.generate_python_client", "bridge": "__umf_codegen", "source": ["scripts/codegen/entry.ts", "src/access"], "baseline": "docs/helix/04-build/evidence/rust-migration/r0/codegen-baseline.json"},
            {"id": "deployment", "publicApi": "umf_codegen.compile_table_deployment", "bridge": "__umf_table_deploy", "source": ["scripts/codegen/entry.ts", "src/table-deployment"], "baseline": "docs/helix/04-build/evidence/rust-migration/r0/codegen-baseline.json"},
            {"id": "verify_deployment", "publicApi": "umf_codegen.verify_table_deployment", "bridge": "__umf_table_verify", "source": ["scripts/codegen/entry.ts", "src/table-deployment"], "baseline": "docs/helix/04-build/evidence/rust-migration/r0/codegen-baseline.json"},
            {"id": "migration", "publicApi": "umf_codegen.compile_table_migration", "bridge": "__umf_table_migrate", "source": ["scripts/codegen/entry.ts", "src/table-migration"], "baseline": "docs/helix/04-build/evidence/rust-migration/r0/codegen-baseline.json"},
            {"id": "verify_migration", "publicApi": "umf_codegen.verify_table_migration", "bridge": "__umf_table_migration_verify", "source": ["scripts/codegen/entry.ts", "src/table-migration"], "baseline": "docs/helix/04-build/evidence/rust-migration/r0/codegen-baseline.json"}],
        "activation": {"roots": sorted(roots), "unresolvedCommandPaths": sorted(set(unknown_activation_roots)),
                       "unresolvedWorkflowActivations": unresolved_workflow_activations,
                       "explicitTraversalExclusions": [".git/**", "node_modules/**", "target/**", "**/{.venv,.virtualenv,.virtualenvs,.tox,.nox,site-packages,dist-packages,__pycache__}/**", "Python environments identified by an ancestor pyvenv.cfg (any directory name)", "bindings/core/wasm/pkg/** (generated host artifact; captured by package harness)", "docs/helix/04-build/evidence/rust-migration/r0/**"]},
        "knownOpenItems": ["python transitive dependency closure is unlocked", "per-module dispositions are a named migration-obligation inventory and still require owner review before closure", "native evidence identities are captured in the accompanying README and plan references"]
    }
    for operation in result["operations"]:
        operation["historicalBaseline"] = operation["baseline"]
        operation["baseline"] = "docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json"
        operation["additiveRustApi"] = operation["publicApi"].replace("umf_codegen.", "umf.rust_codegen.CodegenEngine.")
        operation["productionImplementation"] = "retained Python MiniRacer bridge; default cutover belongs to R4"
        operation["migrationDisposition"] = "R3 complete semantic port and installed-host qualification required; R4 retires this legacy bridge"
    result["operations"].extend([
        {"id": "generate_access_package", "publicApi": "generateAccessPackage", "bridge": None,
         "source": ["src/compilation/index.ts", "src/compilation/admission/index.ts", "src/compilation/targets/python"],
         "baseline": "docs/helix/04-build/evidence/rust-migration/r3/baseline/stage-one.json",
         "additiveRustApi": "umf.rust_codegen.CodegenEngine.generate_access_package",
         "productionImplementation": "retained TypeScript stage-one compiler; default cutover belongs to R4"},
        {"id": "diff_access_packages", "publicApi": "diffAccessPackages", "bridge": None,
         "source": ["src/compilation/admission/diff.ts"],
         "baseline": "docs/helix/04-build/evidence/rust-migration/r3/baseline/stage-one.json",
         "additiveRustApi": "umf.rust_codegen.CodegenEngine.diff_access_packages",
         "productionImplementation": "retained TypeScript stage-one diff; default cutover belongs to R4"},
    ])
    payload = json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    if "--check" in sys.argv:
        current = OUT.read_text() if OUT.exists() else ""
        if current != payload:
            print(f"Rust inventory is stale: {OUT}", file=sys.stderr)
            try:
                expected = json.loads(current)
                actual = json.loads(payload)
                for line in stale_inventory_diagnostics(expected, actual):
                    print(line, file=sys.stderr)
            except json.JSONDecodeError as error:
                print(f"Could not compare inventory JSON: {error}", file=sys.stderr)
            return 1
        print(f"Rust inventory current: {len(modules)} source modules; {sum(s['active'] for s in scripts)} active scripts")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(payload, encoding="utf-8")
    label = OUT.relative_to(ROOT) if OUT.is_relative_to(ROOT) else OUT
    print(f"Wrote {label}: {len(modules)} source modules; {sum(s['active'] for s in scripts)} active scripts; {len(result['dependencies']['javascript']['resolvedClosure'])} JS locked packages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
