"""Actual selected-action emitted types, without clients or target execution."""

import unittest
from dataclasses import FrozenInstanceError
from decimal import Decimal
from typing import Literal, get_args, get_type_hints

from commerce.actions import (
    ShipOrder,
    ShipOrderInput,
    ShipOrderOutput,
    ShipOrderRejected,
)
from commerce.keys import OrderKey
from pydantic import MISSING
from umf_access.codec_support import (
    initialize_action_rejection,
    initialize_rejection,
    revalidate_model,
)


class GeneratedActionTypes(unittest.TestCase):
    def test_original_rejection_helper_abi_is_preserved(self):
        import inspect

        self.assertEqual(len(inspect.signature(initialize_rejection).parameters), 3)
        error = Exception()
        self.assertIsNone(initialize_rejection(error, "OLD", {"OLD": True}))
        self.assertEqual(error.code, "OLD")
        self.assertTrue(error.retryable)
        self.assertEqual(str(error), "action rejected")
        for override, wanted in [(None, True), (False, False), (True, True)]:
            self.assertIs(
                initialize_action_rejection(error, "NEW", {"NEW": True}, override),
                wanted,
            )
            self.assertIs(error.retryable, wanted)

    # @covers US-081-AC4
    def test_key_optional_and_literal_types(self):
        self.assertIs(ShipOrderInput.model_fields["order"].annotation, OrderKey)
        self.assertIs(ShipOrderInput.model_fields["memo"].default, MISSING)
        self.assertIn(MISSING, get_args(ShipOrderInput.model_fields["memo"].annotation))
        self.assertEqual(
            get_type_hints(ShipOrderRejected)["code"],
            Literal["NOT_READY", "ENTITY_MISSING"],
        )
        self.assertEqual(ShipOrder.source.coreVersion, "0.10.0")
        self.assertEqual(len(ShipOrder.source.documentSha256), 64)
        self.assertFalse(ShipOrderRejected("ENTITY_MISSING").retryable)
        self.assertIs(ShipOrder.input_type, ShipOrderInput)
        self.assertIs(ShipOrder.output_type, ShipOrderOutput)
        value = ShipOrderInput(order=OrderKey(order_id="o-1"))
        self.assertIs(value.memo, MISSING)
        self.assertEqual(
            ShipOrderOutput(amount=Decimal("1.200")).amount.as_tuple(),
            Decimal("1.200").as_tuple(),
        )
        self.assertFalse(ShipOrderRejected("NOT_READY").retryable)
        self.assertTrue(ShipOrderRejected("NOT_READY", retryable=True).retryable)
        self.assertFalse(ShipOrderRejected("NOT_READY", retryable=False).retryable)
        with self.assertRaisesRegex(ValueError, "undeclared action rejection code"):
            ShipOrderRejected("UNKNOWN")
        with self.assertRaises(FrozenInstanceError):
            ShipOrder.action = "changed"
        with self.assertRaises(ValueError):
            ShipOrderInput(order="o-1")
        with self.assertRaises(ValueError):
            revalidate_model(
                ShipOrderInput,
                ShipOrderInput.model_construct(
                    order=OrderKey.model_construct(order_id=1)
                ),
            )


if __name__ == "__main__":
    unittest.main()
