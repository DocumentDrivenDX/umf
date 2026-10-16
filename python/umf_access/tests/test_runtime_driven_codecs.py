"""Shared local codec boundary; target transport and temporal qualification held."""
import unittest
from decimal import Decimal
from typing import Annotated, ClassVar
from unittest.mock import patch

from pydantic import BeforeValidator
from umf_access.codec_support import decode_model, encode_model
from umf_access.types import MISSING, StrictModel


def check_amount(value):
    # Resolve the function from its owner on every call, just as generated
    # wrappers do. Patching the shared runtime changes an unchanged model.
    from umf_access import values
    return values.validate_decimal(value, precision=12, scale=2)


class Patch(StrictModel):
    UMF_FINAL: ClassVar[bool] = True
    amount: Annotated[Decimal, BeforeValidator(check_amount)] | MISSING = MISSING
    memo: str | None | MISSING = MISSING


def field(python, identity, kind="identity", item=None):
    return {"python": python, "field": identity, "kind": kind, "item": item}


FIELDS = (field("amount", "totalAmount"), field("memo", "memo"))


class RuntimeCodecTests(unittest.TestCase):
    # @covers US-081-AC1, US-081-AC3, US-081-AC5
    def test_presence_copy_and_sanitized_ingress(self):
        self.assertEqual(encode_model(Patch, Patch(), FIELDS), {})
        self.assertEqual(encode_model(Patch, Patch(memo=None), FIELDS), {"memo": None})
        original = Decimal("1.200")
        decoded = decode_model(Patch, ["memo", "totalAmount"], [None, original], FIELDS)
        self.assertEqual(decoded.amount.as_tuple(), original.as_tuple())
        secret = "private-decimal-value"
        with self.assertRaises(ValueError) as error:
            decode_model(Patch, ["memo", "totalAmount"], [None, secret], FIELDS)
        self.assertIn("amount", str(error.exception))
        self.assertNotIn(secret, str(error.exception))
        with self.assertRaises(TypeError):
            type("Bypass", (Patch,), {})

    # @covers US-081-AC3, US-081-AC5
    def test_inventory_refuses_before_mapping(self):
        for metadata in (FIELDS[:1], FIELDS + (FIELDS[0],),
                         (field("memo", "same"), field("amount", "same"))):
            with patch("umf_access.codec_support._build_mapping") as mapping:
                with self.assertRaises(ValueError):
                    decode_model(Patch, ["memo", "totalAmount"], [None, Decimal(1)], metadata)
                mapping.assert_not_called()
        for columns, row in ((["memo", "memo"], [None, None]),
                             (["memo"], [None]), (["memo", "totalAmount"], [None])):
            with patch("umf_access.codec_support._build_mapping") as mapping:
                with self.assertRaises(ValueError):
                    decode_model(Patch, columns, row, FIELDS)
                mapping.assert_not_called()

    # @covers US-081-AC7 -- unit control; installed two-wheel proof is separate.
    def test_runtime_fix_without_model_regeneration(self):
        invalid = Patch.model_construct(amount=Decimal("1.234"))
        with patch("umf_access.values.validate_decimal", side_effect=lambda value, **kw: value):
            self.assertEqual(encode_model(Patch, invalid, FIELDS), {"totalAmount": Decimal("1.234")})
        with self.assertRaises(ValueError):
            encode_model(Patch, invalid, FIELDS)

    # @covers US-081-AC4 -- nominal DTO identity must survive raw graph copying.
    def test_wrong_key_model_is_not_reinterpreted_as_a_matching_dictionary(self):
        class ExpectedKey(StrictModel):
            identifier: str
        class ForeignKey(StrictModel):
            identifier: str
        class Input(StrictModel):
            key: ExpectedKey
        from umf_access.codec_support import revalidate_model
        with self.assertRaises(ValueError):
            revalidate_model(Input, Input.model_construct(key=ForeignKey(identifier="x")))
        good = Input(key=ExpectedKey(identifier="x"))
        self.assertEqual(revalidate_model(Input, good).key.identifier, "x")

    # @covers US-081-AC3
    def test_nested_mutation_and_unknown_carrier(self):
        class Nested(StrictModel):
            values: list[int]
        fields = (field("values", "values", "array", field("", "")),)
        original = Nested(values=[1])
        encoded = encode_model(Nested, original, fields)
        self.assertIsNot(encoded["values"], original.values)
        original.values.append("private-value")
        with self.assertRaises(ValueError) as error:
            encode_model(Nested, original, fields)
        self.assertNotIn("private-value", str(error.exception))
        with self.assertRaises(ValueError):
            encode_model(Patch, Patch(memo="ok"), (FIELDS[0], field("memo", "memo", "unrecognized")))


if __name__ == "__main__":
    unittest.main()
