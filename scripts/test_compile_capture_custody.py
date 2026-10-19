# SPDX-License-Identifier: MIT OR Apache-2.0
import ast
import hashlib
import inspect
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("record-access-privilege-build.py")
namespace = {"Path": Path, "sys": sys, "inspect": inspect, "hashlib": hashlib}
node = next(
    n
    for n in ast.parse(SCRIPT.read_text()).body
    if isinstance(n, ast.FunctionDef) and n.name == "imported_source_custody"
)
# Execute only the repository-owned helper AST, excluding CLI side effects.
exec(compile(ast.Module(body=[node], type_ignores=[]), str(SCRIPT), "exec"), namespace)  # noqa: S102


class Controls(unittest.TestCase):
    def test_actual_import_paths_and_source_hashes_are_retained(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            package = root / "umf_access"
            package.mkdir()
            (package / "__init__.py").write_text("original")
            source = package / "catalog.py"
            source.write_text("actual source")
            shim = root / "shim.py"
            shim.write_text("compiler shim")
            native = root / "native.so"
            native.write_bytes(b"compiled native bytes")
            modules = {
                "umf_access": types.SimpleNamespace(
                    __file__=str(package / "__init__.py")
                ),
                "weft": types.SimpleNamespace(__file__=str(shim)),
                "weft.weft": types.SimpleNamespace(__file__=str(native)),
            }
            with (
                patch.dict(sys.modules, modules),
                patch.object(
                    inspect,
                    "stack",
                    return_value=[types.SimpleNamespace(filename=str(source))],
                ),
            ):
                record = namespace["imported_source_custody"]()
                self.assertEqual(
                    record["compilerModules"]["weft.weft"]["sha256"],
                    hashlib.sha256(native.read_bytes()).hexdigest(),
                )
                self.assertEqual(
                    record["actualRuntimeSources"][str(source.resolve())]["payload"],
                    "umf_access/catalog.py",
                )
                self.assertFalse(record["nativeAuthority"])
                native.write_bytes(b"changed")
                self.assertNotEqual(
                    namespace["imported_source_custody"]()["compilerModules"],
                    record["compilerModules"],
                )
            with (
                patch.dict(sys.modules, modules),
                patch.object(inspect, "stack", return_value=[]),
                self.assertRaises(ValueError),
            ):
                namespace["imported_source_custody"]()
            modules["weft.weft"] = types.SimpleNamespace(
                __file__=str(root / "missing.so")
            )
            with patch.dict(sys.modules, modules), self.assertRaises(ValueError):
                namespace["imported_source_custody"]()


if __name__ == "__main__":
    unittest.main()
