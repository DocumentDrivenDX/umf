# SPDX-License-Identifier: MIT OR Apache-2.0
"""Named projection and generated field-source checks on full commerce output."""

import ast
import unittest
from decimal import Decimal
from pathlib import Path

import commerce
from commerce import CustomerSummary, OrderIdentity, OrderSummary


class GeneratedProjections(unittest.TestCase):
    # @covers US-081-AC1 @covers US-081-AC6 -- named projection subset.
    def test_named_projection_fields_and_identity(self):
        for model, names, record, fields in (
            (OrderSummary, ["order_id", "amount"], "Order", ["orderId", "amount"]),
            (OrderIdentity, ["order_id"], "Order", ["orderId"]),
            (
                CustomerSummary,
                ["customer_id", "name"],
                "Customer",
                ["customerId", "name"],
            ),
        ):
            self.assertEqual(list(model.model_fields), names)
            self.assertEqual([f.field for f in model.UMF_PROJECTION_FIELDS], fields)
            self.assertTrue(
                all(
                    (f.module, f.element) == ("commerce", record)
                    for f in model.UMF_PROJECTION_FIELDS
                )
            )
            with self.assertRaises(TypeError):
                type("Subclass", (model,), {})
        self.assertEqual(
            OrderSummary(order_id="o-1", amount=Decimal("1.200")).amount.as_tuple(),
            Decimal("1.200").as_tuple(),
        )
        with self.assertRaises(ValueError):
            OrderSummary(order_id="o-1", amount="1.20")

    # @covers US-081-AC6 -- c namespace PEP258 source docstrings and no aliases.
    def test_column_source_docstrings_and_alias_free_source(self):
        package = Path(commerce.__file__).parent
        count = 0
        for file in ("models.py", "keys.py", "fields.py", "actions.py"):
            tree = ast.parse((package / file).read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.keyword):
                    self.assertNotIn(
                        node.arg, {"alias", "validation_alias", "serialization_alias"}
                    )
            if file != "fields.py":
                continue
            for cls in tree.body:
                if not isinstance(cls, ast.ClassDef) or not cls.name.endswith(
                    "Columns"
                ):
                    continue
                for index, node in enumerate(cls.body):
                    if not isinstance(node, ast.AnnAssign):
                        continue
                    doc = cls.body[index + 1]
                    self.assertIsInstance(doc, ast.Expr)
                    self.assertIsInstance(doc.value, ast.Constant)
                    self.assertTrue(
                        doc.value.value.startswith(
                            (
                                "UMF source logical#/modules/0/elements/",
                                "UMF source logical#/modules/0/relationships/",
                            )
                        )
                    )
                    count += 1
        self.assertEqual(count, 10)


if __name__ == "__main__":
    unittest.main()
