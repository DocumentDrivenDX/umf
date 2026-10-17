"""Fresh-process generated import guard; no native services or credentials."""

import importlib
import importlib.abc
import importlib.machinery
import json
import os
import socket
import subprocess
import sys
import sysconfig
from pathlib import Path


def main():
    # Initialize interpreter platform metadata before observing package imports.
    sysconfig.get_config_vars()
    package = Path(sys.argv[1]).resolve()
    modules = []
    for path in sorted(package.rglob("*.py")):
        relative = path.relative_to(package.parent).with_suffix("")
        parts = relative.parts[:-1] if relative.name == "__init__" else relative.parts
        modules.append(".".join(parts))
    forbidden = {
        "umf",
        "weft",
        "truss",
        "ashlar",
        "psycopg",
        "psycopg2",
        "databricks",
        "pyspark",
        "sqlite3",
    }

    class NoDatabaseImports(importlib.abc.MetaPathFinder):
        def find_spec(self, fullname, path=None, target=None):
            if fullname.split(".")[0] in forbidden:
                raise RuntimeError("forbidden database/compiler import")

    reads = []

    def audit(event, args):
        if event.startswith(("socket.", "subprocess.")) or event in {
            "os.system",
            "os.exec",
            "os.posix_spawn",
            "os.fork",
            "os.remove",
            "os.rename",
            "os.mkdir",
            "os.rmdir",
            "os.link",
            "os.symlink",
            "os.truncate",
            "os.chmod",
        }:
            raise RuntimeError("import attempted external side effect")
        if event == "open":
            flags = args[2]
            if flags & (
                os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND
            ):
                raise RuntimeError("import attempted file write")
            if isinstance(args[0], (str, bytes, os.PathLike)):
                name = os.fsdecode(args[0])
                # Python modules and installed distribution metadata are import reads.
                if (
                    not name.endswith(
                        (".py", ".pyc", *importlib.machinery.EXTENSION_SUFFIXES)
                    )
                    and ".dist-info/" not in name
                ):
                    raise RuntimeError("non-module file read during import")
                reads.append(name)

    sys.meta_path.insert(0, NoDatabaseImports())
    sys.addaudithook(audit)
    blocked = []

    def attempted_write():
        with open("/private/tmp/umf-import-probe-must-not-exist", "w"):
            pass

    controls = {
        "network": lambda: socket.socket(),
        "process": lambda: subprocess.Popen([sys.executable, "-c", "pass"]),
        "write": attempted_write,
        "database-import": lambda: importlib.import_module("sqlite3"),
    }
    for label, operation in controls.items():
        try:
            operation()
        except RuntimeError:
            blocked.append(label)
        else:
            raise AssertionError("side-effect control was not blocked: " + label)
    sys.path.insert(0, str(package.parent))
    for name in modules:
        module = importlib.import_module(name)
        if not Path(module.__file__).resolve().is_relative_to(package):
            raise AssertionError("generated import escaped fixture")
    import umf_access

    if "site-packages" not in Path(umf_access.__file__).parts:
        raise AssertionError("runtime must be installed")
    if forbidden.intersection(name.split(".")[0] for name in sys.modules):
        raise AssertionError("forbidden module loaded")
    print(
        json.dumps(
            {
                "status": "pass",
                "modules": modules,
                "blockedControls": blocked,
                "moduleReads": len(reads),
                "runtime": umf_access.__file__,
            }
        )
    )


if __name__ == "__main__":
    main()
