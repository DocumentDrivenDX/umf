# SPDX-License-Identifier: MIT OR Apache-2.0
"""Packaging harness controls; these do not establish runtime behavior."""

import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "packaging"))
from replay_installed import (
    check_generated_inventory,
    check_public_runtime_abi,
    check_runtime_pin,
    classify_import_open,
    inspect_wheel,
    isolated_environment,
    verify_installed_files,
)
from snapshot_runtime import generated_snapshot_identity, reserve_generated_snapshot

PIN = {
    "distribution": "umf_access",
    "version": "0.1.0.dev0",
    "abi": "umf-access-runtime/0.1",
}


class WheelContractTests(unittest.TestCase):
    def test_generated_identity_includes_all_three_pins(self):
        original = ("a" * 64, "b" * 64, "c" * 64)
        base, _ = generated_snapshot_identity(*original)
        self.assertEqual(base, generated_snapshot_identity(*original)[0])
        for index in range(3):
            changed = list(original)
            changed[index] = "d" * 64
            self.assertNotEqual(base, generated_snapshot_identity(*changed)[0])
        with self.assertRaises(ValueError):
            generated_snapshot_identity("bad", original[1], original[2])

    def test_generated_snapshot_never_overwrites_same_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            first = reserve_generated_snapshot(base, "a" * 64, "b" * 64, "c" * 64)
            with self.assertRaises(FileExistsError):
                reserve_generated_snapshot(base, "a" * 64, "b" * 64, "c" * 64)
            second = reserve_generated_snapshot(base, "a" * 64, "b" * 64, "d" * 64)
            self.assertNotEqual(first, second)
            self.assertTrue((first / "identity.json").exists())

    def test_ambient_development_paths_removed(self):
        original = {
            "PYTHONPATH": "development",
            "PYTHONHOME": "development",
            "MYPYPATH": "development",
            "VIRTUAL_ENV": "development",
            "CONDA_PREFIX": "development",
            "PYRIGHT_PYTHON_FORCE_VERSION": "wrong",
            "PATH": "keep",
            "UV_CACHE_DIR": "keep",
        }
        self.assertEqual(
            isolated_environment(original), {"PATH": "keep", "UV_CACHE_DIR": "keep"}
        )
        self.assertEqual(original["PYTHONPATH"], "development")

    def test_public_runtime_abi_missing_or_wrong_refuses(self):
        from types import SimpleNamespace

        check_public_runtime_abi(SimpleNamespace(RUNTIME_ABI=PIN["abi"]), PIN)
        for module in (SimpleNamespace(), SimpleNamespace(RUNTIME_ABI="wrong")):
            with self.assertRaises(ValueError):
                check_public_runtime_abi(module, PIN)

    def test_generated_pin_requires_every_exact_identity(self):
        check_runtime_pin(PIN, PIN)
        for field in PIN:
            wrong = dict(PIN, **{field: "wrong"})
            with self.subTest(field=field), self.assertRaises(ValueError):
                check_runtime_pin(wrong, PIN)
        with self.assertRaises(ValueError):
            check_runtime_pin({}, PIN)

    def test_wheel_metadata_and_marker_required(self):
        with tempfile.TemporaryDirectory() as folder:
            wheel = Path(folder) / "runtime.whl"

            def write(metadata="Name: umf_access\nVersion: 0.1.0.dev0\n", marker=True):
                with zipfile.ZipFile(wheel, "w") as z:
                    z.writestr(
                        "umf_access/__init__.py",
                        'RUNTIME_ABI="umf-access-runtime/0.1"\n',
                    )
                    z.writestr("umf_access-0.1.0.dev0.dist-info/METADATA", metadata)
                    if marker:
                        z.writestr("umf_access/py.typed", "")

            write()
            self.assertIn("umf_access/__init__.py", inspect_wheel(wheel, PIN))
            for metadata, marker in [
                ("Name: wrong\nVersion: 0.1.0.dev0\n", True),
                ("Name: umf_access\nVersion: 1.0\n", True),
                ("Name: umf_access\nVersion: 0.1.0.dev0\n", False),
            ]:
                write(metadata, marker)
                with self.assertRaises(ValueError):
                    inspect_wheel(wheel, PIN)

    def test_wheel_duplicate_and_traversal_refuse(self):
        with tempfile.TemporaryDirectory() as folder:
            wheel = Path(folder) / "bad.whl"
            for entry in ("../escape.py", "/absolute.py"):
                with zipfile.ZipFile(wheel, "w") as z:
                    z.writestr(entry, "x")
                with self.assertRaises(ValueError):
                    inspect_wheel(wheel, PIN)
            with zipfile.ZipFile(wheel, "w") as z:
                z.writestr("same", "one")
                import warnings

                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    z.writestr("same", "two")
            with self.assertRaises(ValueError):
                inspect_wheel(wheel, PIN)

    def test_installed_byte_edit_missing_and_added_code_refuse(self):
        with tempfile.TemporaryDirectory() as folder:
            site = Path(folder)
            package = site / "umf_access"
            package.mkdir()
            (package / "__init__.py").write_bytes(b"original")
            (package / "py.typed").write_bytes(b"")
            files = {"umf_access/__init__.py": b"original", "umf_access/py.typed": b""}
            verify_installed_files(files, site)
            (package / "__init__.py").write_bytes(b"changed")
            with self.assertRaises(ValueError):
                verify_installed_files(files, site)
            (package / "__init__.py").write_bytes(b"original")
            (package / "extra.py").write_bytes(b"")
            with self.assertRaises(ValueError):
                verify_installed_files(files, site)
            (package / "extra.py").unlink()
            (package / "py.typed").unlink()
            with self.assertRaises(ValueError):
                verify_installed_files(files, site)

    def test_import_reads_are_module_or_explicit_loader_metadata(self):
        import os

        self.assertEqual(
            classify_import_open("/installed/module.py", os.O_RDONLY), "module"
        )
        self.assertEqual(
            classify_import_open(
                "/System/Library/CoreServices/SystemVersion.plist", os.O_RDONLY
            ),
            "stdlib-loader-platform-metadata",
        )
        self.assertEqual(
            classify_import_open(
                "/installed/runtime.dist-info/entry_points.txt",
                os.O_RDONLY,
                Path("/installed"),
            ),
            "installed-distribution-loader-metadata",
        )
        for path, flags in [
            ("/private/config.json", os.O_RDONLY),
            ("/installed/module.py", os.O_WRONLY),
        ]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                classify_import_open(path, flags)

    def test_generated_inventory_checks_bytes_and_paths(self):
        import hashlib

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "commerce").mkdir()
            path = root / "commerce/__init__.py"
            path.write_bytes(b"")
            manifest = {
                "inventory": [
                    {
                        "path": "commerce/__init__.py",
                        "sha256": hashlib.sha256(b"").hexdigest(),
                    }
                ]
            }
            check_generated_inventory(root, manifest)
            extra = root / "commerce/extra.py"
            extra.write_bytes(b"")
            with self.assertRaises(ValueError):
                check_generated_inventory(root, manifest)
            extra.unlink()
            path.write_bytes(b"changed")
            with self.assertRaises(ValueError):
                check_generated_inventory(root, manifest)
            for name in (
                "../escape.py",
                "/absolute.py",
                "commerce/__init__.py/../other",
            ):
                with self.assertRaises(ValueError):
                    check_generated_inventory(
                        root, {"inventory": [{"path": name, "sha256": "0" * 64}]}
                    )


if __name__ == "__main__":
    unittest.main()
