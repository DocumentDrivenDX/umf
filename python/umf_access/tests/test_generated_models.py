"""Actual emitter replay against a generated commerce package on the import path.

Package generation and runtime wheel provenance must be recorded by the runner.
This file never generates stand-in models or chooses an alternative runtime.
"""
import json
import unittest
from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import commerce
from commerce.codecs import decode_Order, encode_Order_create, encode_Order_patch
from commerce.keys import BUNDLE_INPUT_DIGEST, OrderKey, OrderLineKey
from commerce.models import OrderCreate, OrderPatch
from pydantic import MISSING


class GeneratedModels(unittest.TestCase):
    # @covers US-081-AC1
    def test_presence_follows_view(self):
        self.assertEqual(encode_Order_patch(OrderPatch()), {})
        self.assertEqual(encode_Order_patch(OrderPatch(memo=None)), {"memo": None})
        for kwargs in ({"amount": None}, {"revision": 1}, {"placed_at": datetime(2024, 1, 1, tzinfo=UTC)}):
            with self.assertRaises(ValueError):
                OrderPatch(**kwargs)
        with self.assertRaises(ValueError):
            OrderCreate(order_id="o-1", amount=Decimal("1.2"), placed_at=datetime(2024, 1, 1, tzinfo=UTC), revision=1)
        value = OrderCreate(order_id="o-1", amount=Decimal("1.200"), placed_at=datetime(2024, 1, 1, tzinfo=timezone(timedelta(seconds=30))))
        encoded = encode_Order_create(value)
        self.assertEqual(encoded["orderId"], "o-1")
        self.assertEqual(encoded["amount"].as_tuple(), value.amount.as_tuple())
        self.assertEqual(encoded["placedAt"].tzinfo, UTC)
        self.assertNotIn("memo", encoded)
        self.assertFalse(any(v is MISSING for v in encoded.values()))
        self.assertTrue(OrderCreate.model_fields["placed_at"].is_required())

    # @covers US-081-AC3
    def test_boundaries_revalidate(self):
        with self.assertRaises(TypeError):
            type("Subclass", (OrderPatch,), {})
        for value in (OrderPatch.model_construct(amount="private-invalid"),
                      OrderPatch().model_copy(update={"amount": "private-invalid"})):
            with self.assertRaises(ValueError) as caught:
                encode_Order_patch(value)
            self.assertNotIn("private-invalid", str(caught.exception))
            self.assertIn("amount", str(caught.exception))

    # @covers US-081-AC4 -- Key subset only; action types remain pending.
    def test_keys_and_digest(self):
        self.assertEqual(list(OrderLineKey.model_fields), ["line_order_id", "line_number"])
        self.assertEqual(dict(OrderKey.KEY_IDENTITY), {"documentId":"commerce-model", "coreVersion":"0.8.0",
                         "module":"commerce", "element":"Order", "key":"order-key"})
        with self.assertRaises(TypeError):
            hash(OrderKey(order_id="o-1"))
        manifest = json.loads((Path(commerce.__file__).parent / "_umf/manifest.json").read_text())
        self.assertEqual(BUNDLE_INPUT_DIGEST, manifest["inputDigest"])

    # @covers US-081-AC5
    def test_decode_checks_inventory_before_mapping(self):
        for columns, row in ((["orderId", "orderId"], ["a", "b"]), ([], []), (["private-unexpected"], [1])):
            with patch("umf_access.codec_support._build_mapping") as mapping:
                with self.assertRaises(ValueError):
                    decode_Order(columns, row)
                mapping.assert_not_called()
        row = decode_Order(["revision", "placedAt", "memo", "amount", "orderId"],
                           [1, datetime(2024, 1, 1, tzinfo=UTC), None, Decimal("1.20"), "o-1"])
        self.assertEqual(row.order_id, "o-1")
        self.assertIsNone(row.memo)
        self.assertEqual(row.amount.as_tuple(), Decimal("1.20").as_tuple())


if __name__ == "__main__":
    unittest.main()
