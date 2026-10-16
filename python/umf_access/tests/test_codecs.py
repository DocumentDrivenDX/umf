"""Actual generated non-temporal codec checks; target carriers unqualified."""

import ast
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
        path = Path(commerce.__file__).parent / "codecs.py"
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            self.assertNotIsInstance(
                node, (ast.If, ast.Raise, ast.Try, ast.For, ast.While, ast.Compare)
            )
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
        self.assertGreaterEqual(len(functions), 12)
        for node in functions:
            self.assertEqual(len(node.body), 1)
            self.assertIsInstance(node.body[0], ast.Return)
            self.assertIsInstance(node.body[0].value, ast.Call)
            self.assertIn(node.body[0].value.func.id, ("encode_model", "decode_model"))
        for node in tree.body:
            if isinstance(node, ast.AnnAssign):
                # Literal metadata cannot execute an artifact-selected factory.
                self.assertFalse(
                    any(isinstance(child, ast.Call) for child in ast.walk(node.value))
                )


if __name__ == "__main__":
    unittest.main()
