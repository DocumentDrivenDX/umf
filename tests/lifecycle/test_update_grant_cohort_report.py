# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused source guard tests; synthetic reports never qualify installed artifacts.

Compile the actual pure helper and pre-DB statements from the witness AST so
these guards can run without importing an installed native UMF/PG pair. No
witness statement is rewritten and no database or native behavior is substituted.
"""
from __future__ import annotations

import argparse
import ast
import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).with_name("update_grant_columns_native.py")
TREE = ast.parse(SOURCE.read_text(), filename=str(SOURCE))
HELPER = next(n for n in TREE.body if isinstance(n, ast.FunctionDef)
              and n.name == "expected_versions_from_cohort_report")
MAIN = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == "main")
PREFIX = []
for node in MAIN.body:
    if isinstance(node, ast.Assign) and any(
        isinstance(t, ast.Name) and t.id == "fixture_bytes" for t in node.targets
    ):
        break
    PREFIX.append(copy.deepcopy(node))
else:
    raise AssertionError("witness preflight boundary not found")
PREFIX.append(ast.parse("return expected_versions, cohort_expected_input").body[0])
PREFLIGHT = copy.deepcopy(MAIN)
PREFLIGHT.name = "witness_preflight"
PREFLIGHT.returns = None
PREFLIGHT.body = PREFIX
GUARD = next(n for n in MAIN.body if isinstance(n, ast.If)
             and isinstance(n.test, ast.Compare)
             and isinstance(n.test.left, ast.Name)
             and n.test.left.id == "installed_versions")
VERSION_CHECK = ast.parse(
    "def check_installed_versions(installed_versions, expected_versions):\n    pass\n"
).body[0]
VERSION_CHECK.body = [copy.deepcopy(GUARD)]
NAMESPACE = {"Path": Path, "hashlib": hashlib, "json": json, "argparse": argparse}
MODULE = ast.fix_missing_locations(ast.Module(
    body=[copy.deepcopy(HELPER), PREFLIGHT, VERSION_CHECK], type_ignores=[]
))
exec(compile(MODULE, str(SOURCE), "exec"), NAMESPACE)
read_expected = NAMESPACE["expected_versions_from_cohort_report"]
preflight = NAMESPACE["witness_preflight"]
check_installed = NAMESPACE["check_installed_versions"]


class CohortReportGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.core = self.root / "core-fixture.whl"
        self.codegen = self.root / "codegen-fixture.whl"
        # Hash-binding unit fixtures, not real wheels or capability evidence.
        self.core.write_bytes(b"synthetic-core-unit-fixture")
        self.codegen.write_bytes(b"synthetic-codegen-unit-fixture")
        self.versions = {
            "umf-core": "0.10.8", "umf-codegen": "0.10.8",
            "pydantic": "2.14.2", "psycopg": "3.3.6", "psycopg-binary": "3.3.6",
            "umf_access": "0.1.0.dev10", "umf-weft": "0.4.57", "umf-truss": "0.0.56",
        }
        self.report = {"version": "1", "install": [
            {"metadata": {"name": name, "version": version},
             "download_info": {"archive_info": {"hashes": {"sha256":
                 hashlib.sha256(self.core.read_bytes() if name == "umf-core" else
                                self.codegen.read_bytes() if name == "umf-codegen" else
                                name.encode()).hexdigest()}}}}
            for name, version in self.versions.items()
        ]}
        self.path = self.root / "synthetic-unit-report.json"

    def write_report(self):
        raw = json.dumps(self.report).encode()
        self.path.write_bytes(raw)
        return hashlib.sha256(raw).hexdigest()

    def entry(self, name):
        return next(x for x in self.report["install"] if x["metadata"]["name"] == name)

    def argv(self, extra=()):
        return [str(SOURCE), "--source-commit", "a" * 40,
                "--core-wheel", str(self.core), "--codegen-wheel", str(self.codegen),
                "--test-wheel-manifest", str(self.root / "unused-test.json"),
                "--pair-deps-manifest", str(self.root / "unused-deps.json"),
                "--dependency-pin", str(self.root / "unused-pin.txt"),
                "--report", str(self.root / "not-produced.json"), *extra]

    def cohort_args(self):
        return ["--cohort-install-report", str(self.path),
                "--cohort-install-report-sha256", self.write_report()]

    def test_exact_selected_report_and_original_wheel_hashes(self):
        with patch.object(sys, "argv", self.argv(self.cohort_args())):
            expected, binding = preflight()
        self.assertEqual(expected["pydantic"], "2.14.2")
        self.assertEqual(set(expected), {"umf-core", "umf-codegen", "pydantic", "psycopg", "psycopg-binary"})
        self.assertEqual(binding["versions"]["umf-access"], "0.1.0.dev10")
        self.assertEqual(binding["wheelSha256"]["umf-core"], hashlib.sha256(self.core.read_bytes()).hexdigest())
        self.assertFalse((self.root / "not-produced.json").exists())

    def test_exact_pydantic_expectation_comes_from_each_report(self):
        for version in ("2.13.0", "2.14.2"):
            with self.subTest(version=version):
                self.entry("pydantic")["metadata"]["version"] = version
                expected, _ = read_expected(self.path, self.write_report())
                self.assertEqual(expected["pydantic"], version)
                check_installed(dict(expected), expected)
                changed = {**expected, "pydantic": "2.11.9"}
                with self.assertRaisesRegex(AssertionError, "unexpected installed UMF pair"):
                    check_installed(changed, expected)

    def test_report_hash_mismatch_refuses(self):
        self.write_report()
        with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
            read_expected(self.path, "0" * 64)

    def test_invalid_report_hash_shape_refuses(self):
        self.write_report()
        for value in ("f" * 63, "F" * 64, "x" * 64):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                read_expected(self.path, value)

    def test_malformed_report_shape_refuses(self):
        for report in ({}, [], {"install": {}}):
            with self.subTest(report=report):
                self.report = report
                with self.assertRaisesRegex(ValueError, "actual pip install report"):
                    read_expected(self.path, self.write_report())

    def test_missing_owner_refuses(self):
        self.report["install"].remove(self.entry("umf_access"))
        with self.assertRaisesRegex(ValueError, "incomplete cohort"):
            read_expected(self.path, self.write_report())

    def test_duplicate_normalized_owner_refuses(self):
        duplicate = copy.deepcopy(self.entry("umf_access"))
        duplicate["metadata"]["name"] = "umf-access"
        self.report["install"].append(duplicate)
        with self.assertRaisesRegex(ValueError, "duplicate or unpinned"):
            read_expected(self.path, self.write_report())

    def test_missing_or_invalid_archive_digest_refuses(self):
        for value in (None, "z" * 64):
            with self.subTest(value=value):
                self.entry("pydantic")["download_info"]["archive_info"]["hashes"]["sha256"] = value
                with self.assertRaisesRegex(ValueError, "duplicate or unpinned"):
                    read_expected(self.path, self.write_report())

    def test_wrong_selected_owner_version_refuses(self):
        self.entry("umf-weft")["metadata"]["version"] = "0.4.56"
        with self.assertRaisesRegex(ValueError, "Access/Weft/Truss"):
            read_expected(self.path, self.write_report())

    def test_wrong_core_and_companion_versions_refuse(self):
        for name in ("umf-core", "umf-codegen"):
            with self.subTest(name=name):
                self.entry(name)["metadata"]["version"] = "0.10.7"
                with self.assertRaisesRegex(ValueError, "selected successor tuple"):
                    read_expected(self.path, self.write_report())
                self.entry(name)["metadata"]["version"] = "0.10.8"

    def test_wrong_psycopg_version_refuses(self):
        self.entry("psycopg")["metadata"]["version"] = "3.2.13"
        with self.assertRaisesRegex(ValueError, "selected successor tuple"):
            read_expected(self.path, self.write_report())

    def test_report_and_hash_arguments_must_be_paired(self):
        self.write_report()
        for args in (["--cohort-install-report", str(self.path)],
                     ["--cohort-install-report-sha256", "a" * 64]):
            with self.subTest(args=args), patch.object(sys, "argv", self.argv(args)):
                with self.assertRaises(SystemExit) as error:
                    preflight()
                self.assertEqual(error.exception.code, 2)

    def test_supplied_core_and_companion_bytes_must_match_report(self):
        for path in (self.core, self.codegen):
            with self.subTest(path=path):
                args = self.cohort_args()
                original = path.read_bytes()
                path.write_bytes(original + b"tamper")
                with patch.object(sys, "argv", self.argv(args)):
                    with self.assertRaisesRegex(ValueError, "supplied UMF wheel differs"):
                        preflight()
                path.write_bytes(original)

    def test_historical_no_report_profile_keeps_original_exact_map(self):
        with patch.object(sys, "argv", self.argv()):
            expected, binding = preflight()
        self.assertIsNone(binding)
        self.assertEqual(expected, {"umf-core": "0.10.7", "umf-codegen": "0.10.7",
                                   "pydantic": "2.11.9", "psycopg": "3.2.13",
                                   "psycopg-binary": "3.2.13"})


if __name__ == "__main__":
    unittest.main()
