#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused parser and negative-control tests for the R4 binary closure gate."""
from __future__ import annotations

import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from check_binary_closure import (
    check_elf_text,
    check_macho_text,
    inspect_binary,
    main,
    parse_elf_dynamic,
    parse_ldd,
    parse_macho_load_commands,
)


MACHO_LOADS = """\
Load command 4
          cmd LC_ID_DYLIB
      cmdsize 96
         name /private/tmp/build/deps/lib_rust_core.dylib (offset 24)
Load command 5
          cmd LC_LOAD_DYLIB
      cmdsize 56
         name /usr/lib/libSystem.B.dylib (offset 24)
Load command 6
          cmd LC_LOAD_WEAK_DYLIB
      cmdsize 56
         name @loader_path/.dylibs/liboptional.dylib (offset 24)
Load command 7
          cmd LC_REEXPORT_DYLIB
      cmdsize 56
         name @rpath/libreexport.dylib (offset 24)
Load command 8
          cmd LC_RPATH
      cmdsize 40
         path @loader_path/.dylibs (offset 12)
"""


class BinaryClosureTests(unittest.TestCase):
    def test_macho_id_is_not_dependency_and_load_kinds_are_collected(self):
        parsed = parse_macho_load_commands(MACHO_LOADS)
        self.assertEqual(parsed["ids"], ["/private/tmp/build/deps/lib_rust_core.dylib"])
        self.assertEqual(parsed["loads"], [
            "/usr/lib/libSystem.B.dylib",
            "@loader_path/.dylibs/liboptional.dylib",
            "@rpath/libreexport.dylib",
        ])
        self.assertEqual(parsed["rpaths"], ["@loader_path/.dylibs"])

    def test_macho_internal_relative_dependencies_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            binary = root / "umf" / "_rust_core.abi3.so"
            binary.parent.mkdir()
            optional = binary.parent / ".dylibs" / "liboptional.dylib"
            optional.parent.mkdir()
            optional.write_bytes(b"fixture")
            reexported = binary.parent / ".system/libreexport.dylib"
            reexported.parent.mkdir()
            reexported.write_bytes(b"fixture")
            system = binary.parent / ".system/libSystem.B.dylib"
            system.write_bytes(b"fixture")
            output = MACHO_LOADS.replace(
                "         name /usr/lib/libSystem.B.dylib (offset 24)\n",
                "         name @rpath/libSystem.B.dylib (offset 24)\n",
            ).replace(
                "         path @loader_path/.dylibs (offset 12)\n",
                "         path @loader_path/.system (offset 12)\n",
            )
            with patch("check_binary_closure.is_system_path", return_value=True):
                result = check_macho_text(binary, root, root / "bin/python", output)
            self.assertEqual(result["errors"], [])
            self.assertEqual(result["dependencies"][0]["classification"], "system")
            self.assertEqual(result["dependencies"][1]["classification"], "bundled")
            self.assertEqual(result["dependencies"][2]["classification"], "bundled")
            self.assertEqual(result["installIdsIgnoredAsDependencies"], [
                "/private/tmp/build/deps/lib_rust_core.dylib"
            ])

    def test_macho_unresolved_or_external_load_is_a_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            binary = root / "umf" / "_rust_core.abi3.so"
            binary.parent.mkdir()
            result = check_macho_text(
                binary,
                root,
                root / "bin/python",
                """Load command 1
          cmd LC_LOAD_DYLIB
         name @rpath/libmissing.dylib (offset 24)
Load command 2
          cmd LC_RPATH
         path /private/tmp/cargo-target (offset 12)
""",
            )
            self.assertEqual(len(result["errors"]), 1)
            self.assertIn("Mach-O load command", result["errors"][0])

    def test_macho_rpath_cannot_turn_a_private_path_into_a_system_library(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            binary = root / "umf/_rust_core.abi3.so"
            binary.parent.mkdir()
            result = check_macho_text(
                binary,
                root,
                root / "bin/python",
                """Load command 1
          cmd LC_LOAD_DYLIB
         name @rpath/libSystem.B.dylib (offset 24)
Load command 2
          cmd LC_RPATH
         path /private/tmp/untrusted (offset 12)
""",
            )
            self.assertTrue(result["errors"])

    def test_macho_rpath_without_an_existing_system_file_is_not_system(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            binary = root / "umf/_rust_core.abi3.so"
            binary.parent.mkdir()
            result = check_macho_text(
                binary,
                root,
                root / "bin/python",
                """Load command 1
          cmd LC_LOAD_DYLIB
         name @rpath/libSystem.B.dylib (offset 24)
Load command 2
          cmd LC_RPATH
         path /usr/lib (offset 12)
""",
            )
            self.assertTrue(result["errors"])

    def test_macho_canonical_absolute_system_load_is_allowlisted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            binary = root / "umf/_rust_core.abi3.so"
            binary.parent.mkdir()
            result = check_macho_text(
                binary,
                root,
                root / "bin/python",
                """Load command 1
          cmd LC_LOAD_DYLIB
         name /usr/lib/libSystem.B.dylib (offset 24)
""",
            )
            self.assertEqual(result["errors"], [])
            self.assertEqual(result["dependencies"][0]["classification"], "system")

    def test_macho_rpath_prefers_first_existing_candidate_even_when_external(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "site-packages"
            binary = root / "umf/_rust_core.abi3.so"
            binary.parent.mkdir(parents=True)
            outside = Path(tmp) / "external"
            outside.mkdir()
            (outside / "libduplicate.dylib").write_bytes(b"external")
            bundled = binary.parent / ".dylibs"
            bundled.mkdir()
            (bundled / "libduplicate.dylib").write_bytes(b"bundled")
            result = check_macho_text(
                binary,
                root,
                root / "bin/python",
                f"""Load command 1
          cmd LC_LOAD_DYLIB
         name @rpath/libduplicate.dylib (offset 24)
Load command 2
          cmd LC_RPATH
         path {outside} (offset 12)
Load command 3
          cmd LC_RPATH
         path @loader_path/.dylibs (offset 12)
""",
            )
            self.assertEqual(result["dependencies"][0]["classification"], "external")
            self.assertTrue(result["errors"])

    def test_macho_exact_loader_rpath_and_cli_executable_anchor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "site-packages"
            binary = root / "umf/_rust_core.abi3.so"
            binary.parent.mkdir(parents=True)
            (binary.parent / "libloader.dylib").write_bytes(b"loader")
            cli = root / "umf/_bin/umf"
            cli.parent.mkdir(parents=True)
            (cli.parent / "libcli.dylib").write_bytes(b"cli")
            loader_result = check_macho_text(
                binary,
                root,
                cli,
                """Load command 1
          cmd LC_LOAD_DYLIB
         name @rpath/libloader.dylib (offset 24)
Load command 2
          cmd LC_RPATH
         path @loader_path (offset 12)
""",
            )
            cli_anchor_result = check_macho_text(
                binary,
                root,
                cli,
                """Load command 1
          cmd LC_LOAD_DYLIB
         name @executable_path/libcli.dylib (offset 24)
""",
            )
            self.assertEqual(loader_result["errors"], [])
            self.assertEqual(cli_anchor_result["errors"], [])

            (binary).write_bytes(b"extension")
            cli.write_bytes(b"cli")
            def fake_run(command):
                inspected = Path(command[-1])
                if inspected == cli.resolve():
                    return """Load command 1
          cmd LC_LOAD_DYLIB
         name @executable_path/libcli.dylib (offset 24)
"""
                return ""

            output = io.StringIO()
            with patch("check_binary_closure.sys.platform", "darwin"), patch(
                "check_binary_closure.run", side_effect=fake_run
            ), contextlib.redirect_stdout(output):
                code = main([
                    "--package-root", str(root),
                    "--cli-binary", str(cli),
                    str(binary), str(cli),
                ])
            self.assertEqual(code, 0)
            self.assertIn('"status": "passed"', output.getvalue())

    def test_macho_recursively_checks_bundled_loads_and_breaks_cycles(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "site-packages"
            binary = root / "umf/_rust_core.abi3.so"
            binary.parent.mkdir(parents=True)
            child = binary.parent / ".dylibs/libnested.dylib"
            child.parent.mkdir()
            binary.write_bytes(b"root")
            child.write_bytes(b"child")

            def fake_run(command):
                if Path(command[-1]) == binary.resolve():
                    return """Load command 1
          cmd LC_LOAD_DYLIB
         name @loader_path/.dylibs/libnested.dylib (offset 24)
"""
                return f"""Load command 1
          cmd LC_LOAD_DYLIB
         name @loader_path/../_rust_core.abi3.so (offset 24)
Load command 2
          cmd LC_LOAD_DYLIB
         name /opt/libevil.dylib (offset 24)
"""

            with patch("check_binary_closure.sys.platform", "darwin"), patch(
                "check_binary_closure.run", side_effect=fake_run
            ):
                report = inspect_binary(binary, root, root / "bin/python")
            nested = report["bundledLoadClosure"][0]
            self.assertTrue(any("/opt/libevil.dylib" in error for error in nested["errors"]))
            self.assertEqual(nested["bundledLoadClosure"][0]["classification"], "already-inspected")

            output = io.StringIO()
            with patch("check_binary_closure.sys.platform", "darwin"), patch(
                "check_binary_closure.run", side_effect=fake_run
            ), contextlib.redirect_stdout(output):
                code = main(["--package-root", str(root), str(binary)])
            self.assertEqual(code, 1)
            self.assertIn('"status": "failed"', output.getvalue())

    def test_elf_needed_and_ldd_not_found_are_a_failure(self):
        dynamic = """\
 0x0000000000000001 (NEEDED) Shared library: [libSystem.so]
 0x000000000000001d (RUNPATH) Library runpath: [$ORIGIN/.libs]
 0x0000000000000001 (NEEDED) Shared library: [libmissing.so]
"""
        self.assertEqual(parse_elf_dynamic(dynamic), {
            "needed": ["libSystem.so", "libmissing.so"],
            "rpaths": ["$ORIGIN/.libs"],
        })
        self.assertEqual(parse_ldd("libmissing.so => not found\n"), {"libmissing.so": None})
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            binary = root / "umf/_rust_core.abi3.so"
            binary.parent.mkdir()
            result = check_elf_text(binary, root, dynamic, "libmissing.so => not found\n")
            self.assertTrue(any("unresolved ELF NEEDED" in error for error in result["errors"]))
            self.assertTrue(any("libSystem.so" in error for error in result["errors"]))

    def test_elf_external_non_system_path_is_a_failure(self):
        dynamic = " 0x1 (NEEDED) Shared library: [libprivate.so]\n"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "site-packages"
            root.mkdir()
            binary = root / "umf/_rust_core.so"
            binary.parent.mkdir()
            result = check_elf_text(
                binary,
                root,
                dynamic,
                "libprivate.so => /opt/custom/lib/libprivate.so (0x1234)\n",
            )
            self.assertTrue(any("outside system and wheel" in error for error in result["errors"]))

    def test_elf_unlisted_runner_library_is_not_accepted_as_system(self):
        dynamic = " 0x1 (NEEDED) Shared library: [libinjected.so]\n"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "site-packages"
            root.mkdir()
            binary = root / "umf/_rust_core.so"
            binary.parent.mkdir()
            result = check_elf_text(
                binary,
                root,
                dynamic,
                "libinjected.so => /usr/lib/libinjected.so (0x1234)\n",
            )
            self.assertTrue(result["errors"])
            self.assertIn("external", result["dependencies"][0]["classification"])

    def test_elf_allowlisted_soname_in_private_usr_lib_subdirectory_is_not_system(self):
        dynamic = " 0x1 (NEEDED) Shared library: [libc.so.6]\n"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "site-packages"
            root.mkdir()
            binary = root / "umf/_rust_core.so"
            binary.parent.mkdir()
            result = check_elf_text(
                binary,
                root,
                dynamic,
                "libc.so.6 => /usr/lib/private/libc.so.6 (0x1234)\n",
            )
            self.assertTrue(result["errors"])
            self.assertEqual(result["dependencies"][0]["classification"], "external")

    def test_elf_absolute_needed_path_is_not_marked_system_provided(self):
        dynamic = " 0x1 (NEEDED) Shared library: [/opt/evil.so]\n"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "site-packages"
            root.mkdir()
            binary = root / "umf/_rust_core.so"
            binary.parent.mkdir()
            result = check_elf_text(
                binary,
                root,
                dynamic,
                "/opt/evil.so (0x1234)\n",
            )
            self.assertTrue(result["errors"])
            self.assertEqual(result["dependencies"][0]["classification"], "external")

    def test_elf_external_transitive_ldd_entry_is_rejected(self):
        dynamic = " 0x1 (NEEDED) Shared library: [libdirect.so]\n"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "site-packages"
            root.mkdir()
            binary = root / "umf/_rust_core.so"
            binary.parent.mkdir()
            result = check_elf_text(
                binary,
                root,
                dynamic,
                "libdirect.so => /usr/lib/libdirect.so (0x1234)\n"
                "libtransitive.so => /opt/libevil.so (0x5678)\n",
            )
            self.assertTrue(any("libtransitive.so" in error for error in result["errors"]))

    def test_elf_needed_vdso_cannot_be_treated_as_kernel_provided(self):
        dynamic = " 0x1 (NEEDED) Shared library: [linux-vdso.so.1]\n"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "site-packages"
            root.mkdir()
            binary = root / "umf/_rust_core.so"
            binary.parent.mkdir()
            result = check_elf_text(
                binary,
                root,
                dynamic,
                "linux-vdso.so.1 (0x1234)\n",
            )
            self.assertTrue(any("cannot be kernel-provided" in error for error in result["errors"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
