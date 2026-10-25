# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused host-side checks for the Rust-reviewed-parameter protocol."""
from __future__ import annotations

import sys
import types
import unittest
import ast
import re
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "src/umf_access/reviewed.py"
tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
selected = [
    node for node in tree.body
    if isinstance(node, (ast.ClassDef, ast.FunctionDef))
    and node.name in {"ReadBuildError", "_parameter_positions", "_parameter_positions_python"}
]
namespace = {"re": re}
exec(compile(ast.Module(body=selected, type_ignores=[]), str(SOURCE), "exec"), namespace)
ReadBuildError = namespace["ReadBuildError"]
_parameter_positions = namespace["_parameter_positions"]
_parameter_positions_python = namespace["_parameter_positions_python"]


class _Scanner:
    def __init__(self, events):
        self.events = iter(events)
        self.replies = []
        self.calls = 0

    def next(self, reply):
        self.replies.append(reply)
        self.calls += 1
        return next(self.events)


def _core(scanner):
    def create(source):
        scanner.source = source
        return scanner
    return types.SimpleNamespace(
        access_reviewed_parameter_profile_version=lambda: "umf-access-reviewed-transport/0.1.0",
        ReviewedParameterScanner=create,
    )


def _installed_core(scanner):
    bridge = _core(scanner)
    parent = types.ModuleType("umf")
    parent.rust_reviewed_parameters = bridge
    return parent, bridge


class NativeReviewedParameterAdapter(unittest.TestCase):
    def test_unicode_callback_and_codepoint_span(self):
        scanner = _Scanner([
            {"kind": "need_python_isalnum", "index": 0},
            {"kind": "placeholder", "start": 6, "end": 8, "digits": "1"},
            {"kind": "done"},
        ])
        parent, rust = _installed_core(scanner)
        with patch.dict(sys.modules, {"umf": parent}):
            sql = "éE'\\' $1'"
            self.assertEqual(_parameter_positions(sql), [(6, 8, 0)])
        self.assertIs(scanner.source, sql)
        self.assertEqual(scanner.replies, [None, True, None])

    def test_python_integer_digit_limit_precedes_later_scanner_event(self):
        if not hasattr(sys, "get_int_max_str_digits") or not sys.get_int_max_str_digits():
            self.skipTest("this interpreter has no active int digit limit")
        digits = "1" * (sys.get_int_max_str_digits() + 1)
        scanner = _Scanner([
            {"kind": "placeholder", "start": 0, "end": len(digits) + 1, "digits": digits},
            {"kind": "error", "code": "unterminated_quote", "message": "unterminated compiler SQL quote"},
        ])
        parent, rust = _installed_core(scanner)
        with patch.dict(sys.modules, {"umf": parent}):
            with self.assertRaises(ValueError):
                _parameter_positions("$" + digits + "'")
        self.assertEqual(scanner.calls, 1)

    def test_lexical_error_constructs_original_exception_directly(self):
        scanner = _Scanner([{
            "kind": "error", "code": "unterminated_quote",
            "message": "unterminated compiler SQL quote",
        }])
        parent, rust = _installed_core(scanner)
        with patch.dict(sys.modules, {"umf": parent}):
            with self.assertRaises(ReadBuildError) as caught:
                _parameter_positions("'open")
        self.assertEqual(str(caught.exception), "unterminated compiler SQL quote")
        self.assertIsNone(caught.exception.__cause__)
        self.assertIsNone(caught.exception.__context__)
        self.assertFalse(caught.exception.__suppress_context__)

    def test_str_subclass_stays_on_dynamic_python_predecessor(self):
        calls = []
        class SQL(str):
            def startswith(self, prefix, start=0, end=None):
                calls.append((prefix, start))
                return super().startswith(prefix, start, len(self) if end is None else end)
        sql = SQL("-- c\n$2")
        parent = types.ModuleType("umf")
        with patch.dict(sys.modules, {"umf": parent}):
            self.assertEqual(_parameter_positions(sql), _parameter_positions_python(sql))
        self.assertTrue(calls)

    def test_invalid_event_fails_closed(self):
        scanner = _Scanner([{"kind": "placeholder", "start": 0, "end": 2, "digits": "2"}])
        parent, rust = _installed_core(scanner)
        with patch.dict(sys.modules, {"umf": parent}):
            with self.assertRaisesRegex(ReadBuildError, "native reviewed scanner result differs"):
                _parameter_positions("$1")

    def test_empty_digit_event_refuses_without_index_error(self):
        scanner = _Scanner([{"kind": "placeholder", "start": 0, "end": 1, "digits": ""}])
        parent, rust = _installed_core(scanner)
        with patch.dict(sys.modules, {"umf": parent}):
            with self.assertRaisesRegex(ReadBuildError, "native reviewed scanner result differs"):
                _parameter_positions("$")

    def test_binding_memory_error_passes_through_adapter(self):
        parent, rust = _installed_core(_Scanner([]))
        def fail_allocation(source):
            raise MemoryError("reviewed SQL ordinal allocation failed")
        rust.ReviewedParameterScanner = fail_allocation
        with patch.dict(sys.modules, {"umf": parent}):
            with self.assertRaisesRegex(MemoryError, "ordinal allocation failed"):
                _parameter_positions("$1")

    def test_missing_bridge_capability_keeps_explicit_refusal(self):
        parent = types.ModuleType("umf")
        parent.rust_reviewed_parameters = types.SimpleNamespace(
            access_reviewed_parameter_profile_version=None,
            ReviewedParameterScanner=None,
        )
        with patch.dict(sys.modules, {"umf": parent}):
            with self.assertRaisesRegex(ReadBuildError, "lacks reviewed parameter profile"):
                _parameter_positions("$1")


if __name__ == "__main__":
    unittest.main()
