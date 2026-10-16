"""Red helper tests against a proposed ABI; generator integration still pending."""
import unittest
from decimal import Decimal
from dataclasses import FrozenInstanceError
from typing import Annotated, ClassVar, final
from unittest.mock import patch

from pydantic import AfterValidator
from umf_access.types import MISSING, StrictModel, ActionRef
from umf_access.values import validate_decimal
from umf_access.codec_support import revalidate_model, checked_row

Amount = Annotated[Decimal, AfterValidator(
    lambda value: validate_decimal(value, precision=12, scale=2))]


@final
class Patch(StrictModel):
    amount: Amount | MISSING = MISSING
    memo: str | None | MISSING = MISSING
    __hash__: ClassVar[None] = None

    def __init_subclass__(cls, **kwargs):
        raise TypeError("Generated models are final")


@final
class Nested(StrictModel):
    patches: list[Patch]

    def __init_subclass__(cls, **kwargs):
        raise TypeError("Generated models are final")


@final
class Mapped(StrictModel):
    patches: dict[str, list[Patch]]

    def __init_subclass__(cls, **kwargs):
        raise TypeError("Generated models are final")


class CodecBoundaryTests(unittest.TestCase):
    # @covers US-081-AC1
    def test_presence_is_not_null_or_default(self):
        value = revalidate_model(Patch, Patch())
        self.assertIs(value.amount, MISSING)
        self.assertIsNone(revalidate_model(Patch, Patch(memo=None)).memo)
        for kwargs in ({"amount": None}, {"revision": 1}, {"placed_at": "x"}):
            with self.assertRaises(ValueError):
                Patch(**kwargs)

    # @covers US-081-AC3
    def test_frozen_and_final(self):
        with self.assertRaises(TypeError):
            type("Subclass", (Patch,), {})
        with self.assertRaises(ValueError):
            Patch().memo = "change"
        with self.assertRaises(TypeError):
            hash(Patch())

    # @covers US-081-AC3
    def test_raw_graph_revalidation_detects_bypasses_and_mutation(self):
        secret = "sensitive-invalid-decimal"
        invalid = Patch.model_construct(amount=secret)
        copied = Patch(amount=Decimal("1.2")).model_copy(update={"amount": secret})
        nested = Nested(patches=[Patch()])
        nested.patches.append(invalid)
        for model, value in ((Patch, invalid), (Patch, copied), (Nested, nested)):
            with self.assertRaises(ValueError) as caught:
                revalidate_model(model, value)
            self.assertNotIn(secret, str(caught.exception))
        # Valid graph is independently reconstructed, including mutable children.
        original = Nested(patches=[Patch()])
        checked = revalidate_model(Nested, original)
        self.assertIsNot(checked, original)
        self.assertIsNot(checked.patches, original.patches)
        self.assertIsNot(checked.patches[0], original.patches[0])

    # @covers US-081-AC3
    def test_nested_dict_and_list_cannot_smuggle_unchecked_models(self):
        secret = "private-unvalidated-value"
        value = Mapped(patches={"group": [Patch(amount=Decimal("1.20"))]})
        checked = revalidate_model(Mapped, value)
        self.assertIsNot(checked.patches, value.patches)
        self.assertIsNot(checked.patches["group"], value.patches["group"])
        value.patches["group"].append(Patch.model_construct(amount=secret))
        with self.assertRaises(ValueError) as caught:
            revalidate_model(Mapped, value)
        self.assertNotIn(secret, str(caught.exception))
        self.assertIn("amount", str(caught.exception))

    # @covers US-081-AC3
    def test_unknown_and_missing_raw_attributes_refuse(self):
        for value in (Patch.model_copy(Patch(), update={"unknown": "private-extra"}),):
            with self.assertRaises(ValueError) as caught:
                revalidate_model(Patch, value)
            self.assertNotIn("private-extra", str(caught.exception))
        value = Nested.model_construct()
        with self.assertRaises(ValueError):
            revalidate_model(Nested, value)

    # @covers US-081-AC3
    def test_cycles_and_attacker_controlled_location_do_not_leak(self):
        value = Nested.model_construct(patches=[])
        value.patches.append(value)
        with self.assertRaises(ValueError):
            revalidate_model(Nested, value)
        mapped = Mapped.model_construct(patches={"private-map-key": [Patch.model_construct(amount="private-value")]})
        with self.assertRaises(ValueError) as caught:
            revalidate_model(Mapped, mapped)
        self.assertNotIn("private-map-key", str(caught.exception))
        self.assertNotIn("private-value", str(caught.exception))
        self.assertIn("amount", str(caught.exception))

    # @covers US-081-AC4 -- immutable type-reference subset only; no executor.
    def test_action_reference_is_immutable_and_typed(self):
        action = ActionRef(module="commerce", action="shipOrder", input_type=Patch, output_type=Nested)
        self.assertIs(action.input_type, Patch)
        self.assertIs(action.output_type, Nested)
        with self.assertRaises(FrozenInstanceError):
            action.action = "changed"
        with self.assertRaises(TypeError):
            type("MutableAction", (ActionRef,), {})
        for kwargs in ({"module":"", "action":"x", "input_type":Patch, "output_type":Nested},
                       {"module":"m", "action":"x", "input_type":dict, "output_type":Nested}):
            with self.assertRaises((ValueError, TypeError)):
                ActionRef(**kwargs)
        self.assertIs(ActionRef(module="m", action="recipe", input_type=Patch, output_type=type(None)).output_type, type(None))

    # @covers US-081-AC5
    def test_inventory_is_checked_before_mapping(self):
        for columns, row in ((["amount", "amount"], [1, 2]),
                             ([], []), (["unexpected"], [1]),
                             (["amount"], []), (["amount"], [1, 2])):
            with patch("umf_access.codec_support._build_mapping") as mapping:
                with self.assertRaises(ValueError):
                    checked_row(["amount"], columns, row)
                mapping.assert_not_called()
        self.assertEqual(checked_row(["memo", "amount"], ["amount", "memo"],
                                     [Decimal("1.20"), None]),
                         {"amount": Decimal("1.20"), "memo": None})


if __name__ == "__main__":
    unittest.main()
