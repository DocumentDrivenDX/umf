# SPDX-License-Identifier: MIT OR Apache-2.0
"""Actual generated non-temporal codec checks; target carriers unqualified."""

import ast
import json
import os
import subprocess
import sys
import unittest
from decimal import Decimal
from pathlib import Path

import commerce
from commerce import OrderPatch
from commerce.codecs import decode_OrderSummary, encode_Order_patch


class GeneratedCodecTests(unittest.TestCase):
    # @covers US-081-AC3, US-081-AC5
    def test_non_temporal_decode_and_bypass(self):
        row = decode_OrderSummary(["amount", "orderId"], [Decimal("1.200"), "o-1"])
        self.assertEqual(row.amount.as_tuple(), Decimal("1.200").as_tuple())
        for value in (
            OrderPatch.model_construct(amount="private-invalid"),
            OrderPatch().model_copy(update={"amount": Decimal("1.234")}),
        ):
            with self.assertRaises(ValueError) as error:
                encode_Order_patch(value)
            self.assertNotIn("private-invalid", str(error.exception))
        with self.assertRaises(ValueError) as error:
            decode_OrderSummary(["orderId", "amount"], ["o-1", "private-invalid"])
        self.assertNotIn("private-invalid", str(error.exception))

    # @covers US-081-AC8
    def test_generated_codecs_are_thin(self):
        package = Path(commerce.__file__).parent
        modules = sorted(package.rglob("*.py"))
        self.assertTrue(
            {
                "__init__.py",
                "models.py",
                "keys.py",
                "fields.py",
                "actions.py",
                "codecs.py",
            }.issubset({path.name for path in modules})
        )
        codec_count = 0
        for path in modules:
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                # TYPE_CHECKING imports are declarative and never execute here.
                if (
                    isinstance(node, ast.If)
                    and isinstance(node.test, ast.Name)
                    and node.test.id == "TYPE_CHECKING"
                ):
                    continue
                self.assertNotIsInstance(
                    node,
                    (ast.If, ast.Raise, ast.Try, ast.For, ast.While, ast.Compare),
                    str(path),
                )
                if isinstance(
                    node, (ast.FunctionDef, ast.AsyncFunctionDef)
                ) and node.name.startswith(("encode_", "decode_")):
                    codec_count += 1
                    self.assertEqual(len(node.body), 1, str(path))
                    returned = node.body[0]
                    self.assertIsInstance(returned, ast.Return)
                    self.assertIsInstance(returned.value, ast.Call)
                    call = returned.value
                    self.assertIsInstance(call.func, ast.Name)
                    self.assertIn(call.func.id, ("encode_model", "decode_model"))
                    metadata = [
                        arg.id
                        for arg in call.args
                        if isinstance(arg, ast.Name) and arg.id.startswith("_codec_")
                    ]
                    self.assertEqual(len(metadata), 1)
                    declaration = next(
                        n
                        for n in tree.body
                        if isinstance(n, ast.AnnAssign)
                        and isinstance(n.target, ast.Name)
                        and n.target.id == metadata[0]
                    )
                    allowed = (
                        ast.Tuple,
                        ast.List,
                        ast.Dict,
                        ast.Constant,
                        ast.Name,
                        ast.Load,
                        ast.UnaryOp,
                        ast.USub,
                    )
                    self.assertTrue(
                        all(
                            isinstance(child, allowed)
                            for child in ast.walk(declaration.value)
                        ),
                        str(path),
                    )
        self.assertGreaterEqual(codec_count, 12)

    # @covers US-081-AC6 -- installed runtime and every generated module.
    def test_isolated_generated_import_has_no_external_side_effects(self):
        package = Path(commerce.__file__).parent.resolve()
        helper = Path(__file__).with_name("generated_import_probe.py")
        env = {
            k: v
            for k, v in os.environ.items()
            if k
            not in {
                "PYTHONPATH",
                "PYTHONHOME",
                "MYPYPATH",
                "VIRTUAL_ENV",
                "CONDA_PREFIX",
            }
        }
        run = subprocess.run(
            [sys.executable, "-I", "-B", str(helper), str(package)],
            cwd="/private/tmp",
            env=env,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        report = json.loads(run.stdout)
        self.assertEqual(report["status"], "pass")
        self.assertEqual(len(report["modules"]), len(list(package.rglob("*.py"))))
        self.assertEqual(
            set(report["blockedControls"]),
            {"network", "process", "write", "database-import"},
        )


if __name__ == "__main__":
    unittest.main()
