# SPDX-License-Identifier: MIT OR Apache-2.0
"""Prove the generator boundary checker refuses prohibited dependencies and execution."""
import importlib.util
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('codegen_boundaries',ROOT/'scripts/check-codegen-boundaries.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class Boundaries(unittest.TestCase):
    def test_actual_package(self):
        self.assertEqual(checker.check(ROOT/'python/umf_codegen/src/umf_codegen'),[])

    def test_negative_controls(self):
        cases = [('__init__.py','import subprocess\n'),('_writer.py','import py_mini_racer\n'),
                 ('__init__.py','from collections.abc import Iterator\n'),
                 ('_native.py','import py_mini_racer\n'),
                 ('_native.py','subprocess.Popen(["/tmp/foreign-umf"] )\n'),
                 ('__init__.py','exec("print(1)")\n'),('__init__.py','engine.eval("1")\n'),
                 ('_embedded.py','import urllib.request\n'),('_embedded.py','__import__("socket")\n'),
                 ('_writer.py','os.system("node")\n'),('_writer.py','from os import system\n')]
        for name,addition in cases:
            with self.subTest(name=name,addition=addition), tempfile.TemporaryDirectory() as directory:
                root=Path(directory)
                for source in (ROOT/'python/umf_codegen/src/umf_codegen').glob('*.py'):
                    shutil.copyfile(source,root/source.name)
                path=root/name;path.write_text(path.read_text()+addition)
                self.assertTrue(checker.check(root))

    def test_undeclared_owner_refuses(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'extension.py').write_text('import socket')
            self.assertTrue(checker.check(root))


if __name__ == '__main__': unittest.main()
