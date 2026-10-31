# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused DB-API transport checks for the reviewed-parameter bridge."""
from __future__ import annotations

import ast
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "src/umf_access/reviewed.py"
tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
selected = [
    node for node in tree.body
    if isinstance(node, (ast.ClassDef, ast.FunctionDef))
    and node.name in {"ReadBuildError", "_dbapi", "_dbapi_order"}
]
namespace: dict[str, object] = {}
exec(compile(ast.Module(body=selected, type_ignores=[]), str(SOURCE), "exec"), namespace)  # noqa: S102 - execute only AST-selected local definitions for an isolated test.
ReadBuildError = namespace["ReadBuildError"]
_dbapi = namespace["_dbapi"]
_dbapi_order = namespace["_dbapi_order"]


class ReviewedDBAPITransport(unittest.TestCase):
    def test_placeholder_rewrite_escapes_percent_only_in_nonplaceholder_slices(self):
        sql = "SELECT $2, '$3', -- $4 %\n$1, 50% /* $5 % */"
        positions = [(7, 9, 1), (25, 27, 0)]
        with patch.dict(namespace, {"_parameter_positions": lambda value: positions}):
            self.assertEqual(
                _dbapi(sql),
                "SELECT %s, '$3', -- $4 %%\n%s, 50%% /* $5 %% */",
            )

    def test_order_preserves_repetition_and_uses_zero_based_ordinals(self):
        sql = "$1 + $1 + $3"
        positions = [(0, 2, 0), (5, 7, 0), (10, 12, 2)]
        with patch.dict(namespace, {"_parameter_positions": lambda value: positions}):
            self.assertEqual(_dbapi_order(sql, ["zero", "one", "two"]), ["zero", "zero", "two"])

    def test_ordinal_inventory_check_follows_full_lexical_scan(self):
        def lexical_refusal(_sql):
            raise ReadBuildError("unterminated compiler SQL comment")

        with patch.dict(namespace, {"_parameter_positions": lexical_refusal}), self.assertRaisesRegex(ReadBuildError, "unterminated compiler SQL comment"):
                _dbapi_order("$3 /* unclosed", ["only"])

    def test_completed_scan_then_refuses_out_of_inventory_ordinal(self):
        with patch.dict(namespace, {"_parameter_positions": lambda value: [(0, 2, 1)]}), self.assertRaisesRegex(ReadBuildError, "compiler parameter ordinal outside inventory"):
                _dbapi_order("$2", ["only"])


if __name__ == "__main__":
    unittest.main()
