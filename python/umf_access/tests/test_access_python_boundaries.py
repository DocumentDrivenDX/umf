# SPDX-License-Identifier: MIT OR Apache-2.0
"""Regression controls for the exact Rust RRF scorer import boundary."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
CHECKER_PATH = ROOT / "scripts/check-access-python-boundaries.py"
SPEC = importlib.util.spec_from_file_location("access_python_boundaries", CHECKER_PATH)
assert SPEC is not None and SPEC.loader is not None
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)


VALID_FACADE = """\
from __future__ import annotations
import json
import math
from typing import Any
from umf import _rust
from .dsl import Score, Scored, SearchResult
from .postgres_search import SearchError, _finish
"""


class AccessPythonBoundaryTests(unittest.TestCase):
    def _check_facade(self, source: str) -> tuple[int, str]:
        with tempfile.TemporaryDirectory(prefix="umf-access-boundary-") as temporary:
            root = Path(temporary)
            package = root / "python/umf_access/src/umf_access"
            package.mkdir(parents=True)
            (package / "rust_search_rrf.py").write_text(source, encoding="utf-8")
            (package / "dsl.py").write_text("class Score: pass\n", encoding="utf-8")
            (package / "postgres_search.py").write_text("class SearchError: pass\n", encoding="utf-8")
            errors = io.StringIO()
            with contextlib.redirect_stderr(errors):
                result = CHECKER.check(root)
            return result, errors.getvalue()

    def test_exact_rust_scorer_import_seams_are_accepted(self):
        result, errors = self._check_facade(VALID_FACADE)
        self.assertEqual(result, 0, errors)

    def test_new_host_import_is_rejected_by_per_file_allowlist(self):
        result, errors = self._check_facade(VALID_FACADE + "from pathlib import Path\n")
        self.assertEqual(result, 1)
        self.assertIn("strict RRF facade imports", errors)

    def test_unapproved_member_from_allowed_module_is_rejected(self):
        result, errors = self._check_facade(VALID_FACADE + "from json import dumps\n")
        self.assertEqual(result, 1)
        self.assertIn("json outside strict RRF facade imports", errors)

    def test_host_io_builtins_are_rejected_in_scorer_facade(self):
        for builtin in ("open", "input"):
            with self.subTest(builtin=builtin):
                result, errors = self._check_facade(VALID_FACADE + f"{builtin}()\n")
                self.assertEqual(result, 1)
                self.assertIn(f"RRF scorer cannot use host I/O builtin {builtin}", errors)

    def test_unapproved_python_module_import_is_rejected(self):
        result, errors = self._check_facade(VALID_FACADE + "import subprocess\n")
        self.assertEqual(result, 1)
        self.assertIn("strict RRF facade imports", errors)


if __name__ == "__main__":
    unittest.main()
