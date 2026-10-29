# SPDX-License-Identifier: MIT OR Apache-2.0
"""Check the umf_access import graph without importing SDK code or dependencies."""
import argparse
import ast
import sys
import sysconfig
from pathlib import Path


def approved_lifecycle_external_import(name: str, target: str, member: str, *,
                                       verifier_scope: bool = False,
                                       native_wait_scope: bool = False,
                                       native_connection_scope: bool = False,
                                       imported_as: str | None = None) -> bool:
    """Return only the reviewed host-API exceptions for lifecycle modules."""
    if name in {"umf_access.lifecycle.ingress_local_postgres",
                "umf_access.lifecycle.row_originals"}:
        if (target == "psycopg" and member == "Connection"
                and native_connection_scope and imported_as is None):
            return True
        if name == "umf_access.lifecycle.ingress_local_postgres":
            if target == "psycopg" and member == "connect":
                return True
            return (native_wait_scope and imported_as is None
                    and ((target == "psycopg" and member in {"Connection", "Cursor"})
                         or (target == "psycopg._enums" and member in {"Ready", "Wait"})))
        return False
    if name == "umf_access.lifecycle.ingress_store":
        return target == "psycopg.pq" and member == "TransactionStatus"
    verifier_modules = {
        "umf_access.lifecycle.owner_approval_core": "OwnerApprovalCore",
        "umf_access.lifecycle.generation_enrollment_authority":
            "ConfiguredGenerationEnrollmentAuthority",
        "umf_access.lifecycle.generation_authority_bootstrap":
            "ConfiguredGenerationAuthorityRootVerifier",
    }
    if name in verifier_modules and verifier_scope:
        return ((target == "cryptography" and member == "__version__")
                or (target == "cryptography.exceptions" and member == "InvalidSignature")
                or (target == "cryptography.hazmat.primitives.asymmetric.ed25519"
                    and member == "Ed25519PublicKey"))
    return False


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
    helpers = {"canonical": "foundation", "types": "foundation", "values": "foundation", "codec_support": "foundation", "generated_core": "foundation",
               "related_keys": "runtime", "verification": "targets", "managed_delta": "targets", "managed_actions": "targets", "managed_bulk": "targets", "managed_support": "targets", "delta_read": "targets", "postgres_search": "targets", "unity_search": "targets", "search_catalog": "runtime", "commands": "runtime", "manifest_commands": "runtime", "bulk": "runtime", "postgres_bulk": "targets", "native_program": "runtime", "native_actions": "targets", "catalog": "runtime", "reviewed": "runtime", "postgres_read": "targets", "capture": "dsl", "protocols": "runtime", "pages": "runtime", "adoption": "runtime", "engine_catalog": "runtime", "unified": "targets"}
    # Keep the administrative host, approval and optional parser adapters
    # explicit in the module map. They remain within the lifecycle owner.
    helpers.update({"host": "lifecycle", "approval": "lifecycle",
                    "owner_bootstrap": "lifecycle", "owner_approval_core": "lifecycle",
                    "owner_wire": "lifecycle",
                    "owner_authority": "lifecycle", "ingress_custody": "lifecycle",
                    "ingress_local_postgres": "lifecycle", "ingress_store": "lifecycle",
                    "conversion_policy": "lifecycle", "row_originals": "lifecycle",
                    "row_originals_creation": "lifecycle",
                    "row_originals_receipt": "lifecycle",
                    "target_custody_codec": "lifecycle",
                    "generation_enrollment_authority": "lifecycle",
                    "generation_authority_bootstrap": "lifecycle",
                    "supervisor_journal_codec": "lifecycle",
                    "generation_enrollment_ledger": "lifecycle",
                    "generation_authority_session": "lifecycle",
                    "sql_containment": "lifecycle", "sql_containment_parser": "lifecycle",
                    "sql_containment_cli": "lifecycle"})
    # Administration is a separate explicit owner; generator/driver imports do
    # not become available to the portable DSL, regular runtime or other targets.
    allowed["lifecycle"] = {"foundation"}
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

    def edge(name: str, target: str, member: str = "", *, verifier_scope: bool = False,
             native_wait_scope: bool = False, native_connection_scope: bool = False,
             imported_as: str | None = None) -> None:
        path = modules[name]
        source_owner = owner(name)
        if (name == "umf_access.lifecycle.generation_root_registry"
                and target not in {"__future__", "typing",
                                   "umf_access.lifecycle.generation_authority_bootstrap"}):
            fail(path, "PURE", "root registry byte transitions may import only typing and the root verifier")
        codec_imports = {"__future__", "base64", "hashlib", "json", "posixpath", "re", "typing",
                         "umf_access.lifecycle.generation_authority_bootstrap",
                         "umf_access.lifecycle.generation_root_registry"}
        if (name == "umf_access.lifecycle.supervisor_journal_codec"
                and not any(target == allowed or target.startswith(allowed + ".")
                            for allowed in codec_imports)):
            fail(path, "PURE", "supervisor journal codec is a native-free byte codec")
        if name == 'umf_access.lifecycle.sql_containment' and not (
                target in {'collections.abc', 'dataclasses', 'hashlib', 'json', 'typing', '__future__'}):
            fail(path, 'HOST', 'containment admission is pure; parser and I/O belong to explicit adapters')
        if target == "umf_access" or target.startswith("umf_access."):
            if target not in modules:
                fail(path, "UNRESOLVED", target)
                return
            graph[name].add(target)
            target_owner = owner(target)
            if source_owner != target_owner:
                head_probe = (name == 'umf_access.unified.head_session' and target == 'umf_access.lifecycle'
                              and member in {'CatalogError','prepare_table_head','prepare_table_correspondence'})
                if target_owner not in allowed.get(source_owner, set()) and not head_probe:
                    fail(path, "DEPENDENCY", f"{source_owner} -> {target_owner}")
                if target.count(".") != 1 or member.startswith("_"):
                    fail(path, "PRIVATE", f"use public boundary of {target_owner}")
            return
        package = target.split(".")[0]
        if source_owner == "lifecycle" and package in {"psycopg", "umf_codegen"}:
            public = (target == "psycopg" and member == "Error" or target == "psycopg.rows" and member == "tuple_row"
                      or target == "psycopg.types.json" and member == "Jsonb"
                      or approved_lifecycle_external_import(name, target, member, verifier_scope=verifier_scope,
                                                            native_wait_scope=native_wait_scope,
                                                            native_connection_scope=native_connection_scope,
                                                            imported_as=imported_as)
                      or target == "umf_codegen" and member in {"verify_table_deployment", "verify_table_migration"}
                      or name == "umf_access.lifecycle.ledger" and target == "umf_codegen" and member == "compile_table_migration"
                      or name == "umf_access.lifecycle.concurrent" and target == "umf_codegen" and member == "compile_table_deployment"
                      or name == "umf_access.lifecycle.cli" and (target == "umf_codegen" and member == "compile_table_migration" or target == "psycopg" and member == "connect"))
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
        psycopg2_cursor = (name == 'umf_access.unified.session_psycopg2'
                          and target == 'psycopg2.extensions' and member == 'cursor')
        table_read_compiler = (name == 'umf_access.unified.table_reads' and target == 'weft'
                               and member == 'prepare_table_operation_module_json')
        seed_compiler = (name == 'umf_access.lifecycle.seeds' and target == 'weft' and member == 'compile_table_seed_json'
                         or name == 'umf_access.lifecycle.backfills' and target == 'weft' and member == 'prepare_table_operation_module_json')
        # The optional containment adapter has one narrow parser entry point;
        # the pure checker module must not import the parser or its dependencies.
        containment_parser = (name == 'umf_access.lifecycle.sql_containment_parser'
                              and target == 'pglast.parser' and member == 'parse_sql_json')
        if package not in permitted and not spark_error and not typing_backport and not psycopg2_cursor and not table_read_compiler and not seed_compiler and not containment_parser and not approved_lifecycle_external_import(
                name, target, member, verifier_scope=verifier_scope,
                native_wait_scope=native_wait_scope,
                native_connection_scope=native_connection_scope,
                imported_as=imported_as):
            fail(path, "DEPENDENCY", f"{target} outside approved imports for {source_owner}")
        metadata_pin = (name == 'umf_access.lifecycle.sql_containment_parser'
                        and target == 'importlib.metadata' and member in {'version', 'PackageNotFoundError'})
        if package in {"importlib", "runpy"} and not (source_owner == "build" and target in {"importlib", "importlib.metadata"}) and not metadata_pin:
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
        parents = {child: parent for parent in ast.walk(tree)
                   for child in ast.iter_child_nodes(parent)}

        def exact_verifier_method(module_name: str = name,
                                  module_tree: ast.AST = tree) -> ast.FunctionDef | ast.AsyncFunctionDef | None:
            expected_class = {
                "umf_access.lifecycle.owner_approval_core": "OwnerApprovalCore",
                "umf_access.lifecycle.generation_enrollment_authority":
                    "ConfiguredGenerationEnrollmentAuthority",
                "umf_access.lifecycle.generation_authority_bootstrap":
                    "ConfiguredGenerationAuthorityRootVerifier",
            }.get(module_name)
            if expected_class is None:
                return None
            # Only the unique class defined directly in the module and its
            # direct method are the reviewed verifier. Same-named nested or
            # locally shadowing classes/functions are not equivalent scopes.
            classes = [node for node in module_tree.body
                       if isinstance(node, ast.ClassDef) and node.name == expected_class]
            if len(classes) != 1:
                return None
            methods = [node for node in classes[0].body
                       if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                       and node.name == 'verify_approval']
            if len(methods) != 1:
                return None
            method = methods[0]
            pinned = any(
                isinstance(node, ast.Compare)
                and isinstance(node.left, ast.Name)
                and node.left.id == 'crypto_version'
                and len(node.ops) == 1
                and isinstance(node.ops[0], ast.NotEq)
                and any(isinstance(value, ast.Constant) and value.value == '50.0.2'
                        for value in node.comparators)
                for node in ast.walk(method))
            return method if pinned else None

        verifier_method = exact_verifier_method()

        def exact_native_wait_scope(node: ast.AST, *, module_name: str = name,
                                    module_tree: ast.AST = tree,
                                    parent_nodes: dict[ast.AST, ast.AST] = parents) -> bool:
            if module_name != "umf_access.lifecycle.ingress_local_postgres":
                return False
            functions = [item for item in module_tree.body
                         if isinstance(item, ast.FunctionDef)
                         and item.name == "_execute_original_store_sql"]
            if len(functions) != 1:
                return False
            function = functions[0]
            current = node
            while current is not function:
                parent = parent_nodes.get(current)
                if parent is None:
                    return False
                if parent is function:
                    current = parent
                    continue
                if isinstance(parent, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    return False
                current = parent
            return True

        def exact_native_connection_scope(
                node: ast.AST, *, module_name: str = name,
                module_tree: ast.AST = tree,
                parent_nodes: dict[ast.AST, ast.AST] = parents) -> bool:
            allowed_scopes: list[ast.FunctionDef] = []
            if module_name == "umf_access.lifecycle.ingress_local_postgres":
                classes = [item for item in module_tree.body
                           if isinstance(item, ast.ClassDef)
                           and item.name == "LocalPostgresSupervisor"]
                if len(classes) != 1:
                    return False
                methods = [item for item in classes[0].body
                           if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))
                           and item.name == "_capture_original_store_timeout_lower_bounds"]
                if len(methods) != 1 or not isinstance(methods[0], ast.FunctionDef):
                    return False
                allowed_scopes.append(methods[0])
            elif module_name == "umf_access.lifecycle.row_originals":
                functions = [item for item in module_tree.body
                             if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))
                             and item.name == "open_originals_store_recovery"]
                if len(functions) != 1 or not isinstance(functions[0], ast.FunctionDef):
                    return False
                allowed_scopes.append(functions[0])
            else:
                return False
            allowed = set(allowed_scopes)
            current = node
            while current not in allowed:
                parent = parent_nodes.get(current)
                if parent is None:
                    return False
                if parent in allowed:
                    current = parent
                    continue
                if isinstance(parent, (ast.FunctionDef, ast.AsyncFunctionDef,
                                       ast.ClassDef)):
                    return False
                current = parent
            return True

        def approved_verifier_scope(node: ast.AST, *, module_name: str = name,
                                    parent_nodes: dict[ast.AST, ast.AST] = parents,
                                    method: ast.FunctionDef | ast.AsyncFunctionDef | None = verifier_method
                                    ) -> bool:
            if method is None:
                return False
            current = node
            import_guarded = False
            while current is not method:
                parent = parent_nodes.get(current)
                if parent is None:
                    return False
                if isinstance(parent, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    # The only function ancestor permitted is the exact
                    # reviewed module-level verifier itself.
                    if parent is not method:
                        return False
                elif isinstance(parent, ast.ClassDef):
                    # Reject nested classes even when they borrow the
                    # approved class and method names.
                    return False
                if isinstance(parent, ast.Try) and not import_guarded:
                    guarded_nodes = {child for statement in parent.body
                                     for child in ast.walk(statement)}
                    has_import_error = any(
                        isinstance(handler.type, ast.Name) and handler.type.id == 'ImportError'
                        for handler in parent.handlers)
                    import_guarded = current in guarded_nodes and has_import_error
                current = parent
            return import_guarded

        for node in ast.walk(tree):
            lazy_verifier_scope = approved_verifier_scope(node)
            native_wait_scope = exact_native_wait_scope(node)
            native_connection_scope = exact_native_connection_scope(node)
            if isinstance(node, ast.Import):
                for alias in node.names:
                    edge(name, alias.name, verifier_scope=lazy_verifier_scope,
                         native_wait_scope=native_wait_scope,
                         native_connection_scope=native_connection_scope,
                         imported_as=alias.asname)
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
                    edge(name, child if child in modules else target, alias.name,
                         verifier_scope=lazy_verifier_scope, native_wait_scope=native_wait_scope,
                         native_connection_scope=native_connection_scope,
                         imported_as=alias.asname)
                    if alias.name == "*":
                        fail(path, "PRIVATE", "star imports hide public ownership")
            elif isinstance(node, ast.Name) and node.id in {"__import__", "eval", "exec", "compile"}:
                fail(path, "DYNAMIC", f"dynamic execution {node.id}")
            elif (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                  and node.func.id in {"open", "input"}
                  and (owner(name) in {"foundation", "dsl", "runtime", "conformance"}
                       or name in {"umf_access.lifecycle.generation_root_registry",
                                   "umf_access.lifecycle.supervisor_journal_codec"})):
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
