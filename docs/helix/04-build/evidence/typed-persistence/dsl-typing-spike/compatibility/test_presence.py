"""Compatibility probes only; not production SDK acceptance."""
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from pydantic import MISSING, ValidationError
from models import Order, OrderCreate, OrderPatch, encode_patch

class PresenceTests(unittest.TestCase):
    def test_missing_and_null_are_distinct(self):
        self.assertEqual(encode_patch(OrderPatch()), {})
        self.assertEqual(encode_patch(OrderPatch(memo=None)), {"memo": None})
        self.assertEqual(encode_patch(OrderPatch(amount=Decimal("1.200"))), {"amount": Decimal("1.200")})
        self.assertIs(OrderPatch().amount, MISSING)
        self.assertEqual(OrderPatch().model_dump(), {})

    def test_strict_and_extra(self):
        for value in (None, 1, 1.5, True, "1.20"):
            with self.subTest(value=repr(value)), self.assertRaises(ValidationError):
                OrderPatch.model_validate({"amount": value})
        for field in ("revision", "placed_at", "ammount"):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                OrderPatch.model_validate({field: 1})
        with self.assertRaises(ValidationError):
            OrderCreate.model_validate({"order_id": "x", "amount": Decimal("1"), "memo": None, "revision": 1})

    def test_required_nullable_has_no_default(self):
        with self.assertRaises(ValidationError):
            OrderCreate.model_validate({"order_id": "x", "amount": Decimal("1")})
        self.assertIsNone(OrderCreate(order_id="x", amount=Decimal("1"), memo=None).memo)

    def test_frozen_and_sealed(self):
        model = OrderPatch()
        with self.assertRaises(ValidationError):
            model.amount = Decimal("2")
        with self.assertRaises(TypeError):
            type("Bypass", (OrderPatch,), {})

    def test_codec_revalidates_all_bypasses(self):
        invalid = [OrderPatch.model_construct(amount="PRIVATE-VALUE"),
                   OrderPatch().model_copy(update={"amount": "PRIVATE-VALUE"})]
        nested = OrderPatch(tags=["ok"])
        nested.tags.append(123)
        invalid.append(nested)
        for value in invalid:
            with self.subTest(value=type(value).__name__), self.assertRaises(ValueError) as caught:
                encode_patch(value)
            self.assertNotIn("PRIVATE-VALUE", str(caught.exception))

    def test_classvars_and_aliases(self):
        self.assertNotIn("c", Order.model_json_schema()["properties"])
        self.assertNotIn("objects", Order.model_json_schema()["properties"])
        for model in (Order, OrderCreate, OrderPatch):
            for field in model.model_fields.values():
                self.assertIsNone(field.alias)
                self.assertIsNone(field.validation_alias)
                self.assertIsNone(field.serialization_alias)

    def test_strict_date_rejects_datetime(self):
        from pydantic import TypeAdapter, ConfigDict
        adapter = TypeAdapter(date, config=ConfigDict(strict=True))
        self.assertEqual(adapter.validate_python(date(2026, 1, 1)), date(2026, 1, 1))
        with self.assertRaises(ValidationError):
            adapter.validate_python(datetime(2026, 1, 1, tzinfo=timezone.utc))

if __name__ == "__main__":
    unittest.main()
