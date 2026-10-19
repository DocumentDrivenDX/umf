# SPDX-License-Identifier: MIT OR Apache-2.0
"""Check the umf_access import graph without importing SDK code or dependencies."""
import argparse
import ast
from pathlib import Path
import sys
import sysconfig


def check(root: Path) -> int:
    package_root = root / "python/umf_access"
    bases = [package_root, package_root / "src/umf_access"]
    # macOS's system python3 is still 3.9; do not import candidate modules to
    # decide whether they belong to the standard library.
    stdlib = set(getattr(sys, "stdlib_module_names", ())) | set(sys.builtin_module_names)
    if not hasattr(sys, "stdlib_module_names"):
        # Framework Python installations can retain an obsolete build-time
        # DESTSHARED (for example Xcode.app after moving to CommandLineTools).
        # Derive extension directories from the interpreter's own stdlib paths,
        # never arbitrary sys.path entries or site-packages.
        directories = {Path(sysconfig.get_path(key)) for key in ("stdlib", "platstdlib")}
        directories.update(directory / "lib-dynload" for directory in list(directories))
        shared = sysconfig.get_config_var("DESTSHARED")
        if shared:
            directories.add(Path(shared))
        for directory in sorted(directories):
            if not directory.exists():
                continue
            for child in directory.iterdir():
                name = child.name.split(".")[0]
                if name.isidentifier() and (child.suffix == ".py" or child.suffix == ".so" or (child / "__init__.py").exists()):
                    stdlib.add(name)
    errors: list[str] = []
    modules: dict[str, Path] = {}
    graph: dict[str, set[str]] = {}
    allowed = {"foundation": set(), "dsl": {"foundation"},
               "build": {"dsl", "runtime", "foundation"}, "runtime": {"dsl", "foundation"},
               "targets": {"runtime", "dsl", "foundation"}, "conformance": {"runtime", "foundation"},
               "facade": {"dsl", "runtime", "foundation"}}
    helpers = {"types": "foundation", "values": "foundation", "codec_support": "foundation", "generated_core": "foundation",
               "related_keys": "runtime", "verification": "targets", "managed_delta": "targets", "managed_actions": "targets", "managed_bulk": "targets", "managed_support": "targets", "delta_read": "targets", "postgres_search": "targets", "unity_search": "targets", "search_catalog": "runtime", "commands": "runtime", "manifest_commands": "runtime", "bulk": "runtime", "postgres_bulk": "targets", "native_program": "runtime", "native_actions": "targets", "catalog": "runtime", "reviewed": "runtime", "postgres_read": "targets", "capture": "dsl", "protocols": "runtime", "pages": "runtime", "adoption": "runtime", "engine_catalog": "runtime", "unified": "targets"}
    # Administration is a separate explicit owner; generator/driver imports do
    # not become available to the portable DSL, regular runtime or other targets.
    allowed["lifecycle"] = set()
    extras = {"build": {"weft"}, "targets": {"psycopg", "databricks", "pyspark"},
              "lifecycle": {"psycopg", "umf_codegen"}}

    def fail(path: Path, code: str, message: str) -> None:
        errors.append(f"{path.relative_to(root)}: {code} {message}")

    for base in bases:
        for path in sorted(base.rglob("*")) if base.exists() else []:
            # Tests and distribution tooling are not shipped runtime modules.
            relative = path.relative_to(base)
            if relative.parts[0] in {"tests", "__pycache__", "src", "dist", ".venv"} and base == package_root:
                continue
            if "__pycache__" in relative.parts:
                continue
            if path.is_symlink():
                fail(path, "SYMLINK", "scoped sources must be ordinary files")
            elif path.suffix in {".py", ".pyi"}:
                parts = list(relative.with_suffix("").parts)
                if parts[-1] == "__init__":
                    parts.pop()
                name = ".".join(["umf_access", *parts])
                if name in modules:
                    fail(path, "DUPLICATE", f"module also present at {modules[name].relative_to(root)}")
                modules[name] = path
                graph[name] = set()
    if not modules:
        fail(package_root, "EMPTY", "no SDK source modules discovered in either supported layout")

    def owner(name: str) -> str:
        parts = name.split(".")
        return helpers.get(parts[1], parts[1]) if len(parts) > 1 else "facade"

    def edge(name: str, target: str, member: str = "") -> None:
        path = modules[name]
        source_owner = owner(name)
        if target == "umf_access" or target.startswith("umf_access."):
            if target not in modules:
                fail(path, "UNRESOLVED", target)
                return
            graph[name].add(target)
            target_owner = owner(target)
            if source_owner != target_owner:
                if target_owner not in allowed.get(source_owner, set()):
                    fail(path, "DEPENDENCY", f"{source_owner} -> {target_owner}")
                if target.count(".") != 1 or member.startswith("_"):
                    fail(path, "PRIVATE", f"use public boundary of {target_owner}")
            return
        package = target.split(".")[0]
        if source_owner == "lifecycle" and package in {"psycopg", "umf_codegen"}:
            public = (target == "psycopg" and member == "Error" or target == "psycopg.rows" and member == "tuple_row"
                      or target == "psycopg.types.json" and member == "Jsonb"
                      or target == "umf_codegen" and member in {"verify_table_deployment", "verify_table_migration"})
            if not public:
                fail(path, "PRIVATE", "administration uses only the original public verifier and native exception boundary")
                return
        permitted = stdlib | {"pydantic"} | extras.get(source_owner, set())
        if name == "umf_access.runtime.bulk":
            permitted.add("weft")
        # The optional Spark target needs the real driver exception classes to
        # inspect structured native retention failures, never message matching.
        spark_error = name in {"umf_access.delta_read", "umf_access.targets.delta_read"} and source_owner == "targets" and target == "py4j.protocol" and member in {"Py4JError", "Py4JJavaError"}
        # Defaulted navigation phantoms preserve the old five-argument ABI on
        # Python3.11; this exact pinned typing backport performs no host I/O.
        typing_backport = name == "umf_access.dsl.navigation" and target == "typing_extensions" and member == "TypeVar"
        if package not in permitted and not spark_error and not typing_backport:
            fail(path, "DEPENDENCY", f"{target} outside approved imports for {source_owner}")
        if package in {"importlib", "runpy"} and not (source_owner == "build" and target in {"importlib", "importlib.metadata"}):
            fail(path, "DYNAMIC", "dynamic loading module")
        if source_owner in {"foundation", "dsl", "runtime", "conformance"} and package in {"os", "socket", "urllib", "http", "ftplib", "subprocess", "pathlib", "io", "shutil"}:
            fail(path, "HOST", f"host I/O module {package} is outside pure SDK boundary")
        if source_owner == "build" and package in {"socket", "urllib", "http", "ftplib"}:
            fail(path, "DEPENDENCY", "catalog build cannot use network")

    for name, path in modules.items():
        if owner(name) not in allowed:
            fail(path, "MODULE", "source has no module-map owner")
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (SyntaxError, UnicodeError) as error:
            fail(path, "SYNTAX", str(error))
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    edge(name, alias.name)
            elif isinstance(node, ast.ImportFrom):
                target = node.module or ""
                if node.level:
                    package = name.split(".") if path.stem == "__init__" else name.split(".")[:-1]
                    if node.level > len(package):
                        fail(path, "UNRESOLVED", "relative import escapes package")
                        continue
                    prefix = package[:len(package) - node.level + 1]
                    target = ".".join(prefix + ([target] if target else []))
                for alias in node.names:
                    child = f"{target}.{alias.name}"
                    edge(name, child if child in modules else target, alias.name)
                    if alias.name == "*":
                        fail(path, "PRIVATE", "star imports hide public ownership")
            elif isinstance(node, ast.Name) and node.id in {"__import__", "eval", "exec", "compile"}:
                fail(path, "DYNAMIC", f"dynamic execution {node.id}")
            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {"open", "input"} and owner(name) in {"foundation", "dsl", "runtime", "conformance"}:
                fail(path, "HOST", f"host I/O builtin {node.func.id}")

    active: set[str] = set()
    done: set[str] = set()

    def cycle(name: str) -> None:
        if name in active:
            fail(modules[name], "CYCLE", "dependency cycle")
            return
        if name in done:
            return
        active.add(name)
        for target in sorted(graph[name]):
            cycle(target)
        active.remove(name)
        done.add(name)

    for name in modules:
        cycle(name)
    for error in sorted(set(errors)):
        print(error, file=sys.stderr)
    print("scan roots: " + ", ".join(str(base.relative_to(root)) for base in bases))
    print(f"access Python boundaries: {len(modules)} modules, {len(errors)} violations")
    return int(bool(errors))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    sys.exit(check(parser.parse_args().root.resolve()))
