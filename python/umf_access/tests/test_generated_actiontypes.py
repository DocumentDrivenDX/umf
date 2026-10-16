"""Actual selected-action emitted types, without clients or target execution."""
import unittest
from dataclasses import FrozenInstanceError
from decimal import Decimal
from typing import Literal, get_type_hints, get_args

from pydantic import MISSING
from umf_access.codec_support import revalidate_model
from commerce.actions import ShipOrder, ShipOrderInput, ShipOrderOutput, ShipOrderRejected
from commerce.keys import OrderKey


class GeneratedActionTypes(unittest.TestCase):
    # @covers US-081-AC4
    def test_key_optional_and_literal_types(self):
        self.assertIs(ShipOrderInput.model_fields["order"].annotation, OrderKey)
        self.assertIs(ShipOrderInput.model_fields["memo"].default, MISSING)
        self.assertIn(MISSING, get_args(ShipOrderInput.model_fields["memo"].annotation))
        self.assertEqual(get_type_hints(ShipOrderRejected)["code"], Literal["NOT_READY", "ENTITY_MISSING"])
        self.assertIs(ShipOrder.input_type, ShipOrderInput)
        self.assertIs(ShipOrder.output_type, ShipOrderOutput)
        value = ShipOrderInput(order=OrderKey(order_id="o-1"))
        self.assertIs(value.memo, MISSING)
        self.assertEqual(ShipOrderOutput(amount=Decimal("1.200")).amount.as_tuple(), Decimal("1.200").as_tuple())
        self.assertFalse(ShipOrderRejected("NOT_READY").retryable)
        with self.assertRaises(FrozenInstanceError):
            ShipOrder.action = "changed"
        with self.assertRaises(ValueError):
            ShipOrderInput(order="o-1")
        with self.assertRaises(ValueError):
            revalidate_model(ShipOrderInput, ShipOrderInput.model_construct(order=OrderKey.model_construct(order_id=1)))


if __name__ == "__main__":
    unittest.main()
