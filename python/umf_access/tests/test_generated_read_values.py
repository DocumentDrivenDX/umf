# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exact native DB-API decoding for positional generated-read frames."""

from __future__ import annotations

import unittest
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from umf_access.types import ValueRuleError
from umf_access.unified.operation_values import generated_read_value_from_native
from umf_access.unified.session_policy import SessionError
from umf_access.values import FieldValidator


class GeneratedReadValueTests(unittest.TestCase):
    def test_generated_uuid_field_validation_preserves_exact_uuid_type(self):
        value = UUID("00112233-4455-6677-8899-aabbccddeeff")
        self.assertIs(FieldValidator(kind="uuid")(value), value)
        with self.assertRaises(ValueRuleError):
            FieldValidator(kind="uuid")(str(value))

    def check_value(self, value, carrier, native_kind, oid):
        return generated_read_value_from_native(
            value,
            {"carrier": carrier, "nullable": False},
            {"kind": native_kind},
            oid,
        )

    def test_boolean_string_integer_and_decimal_are_tagged_without_coercion(self):
        self.assertEqual(
            self.check_value(True, "boolean", "boolean", 16), {"boolean": True}
        )
        self.assertEqual(self.check_value("x", "string", "text", 25), {"string": "x"})
        self.assertEqual(
            self.check_value(42, "integer", "int4", 23), {"integerToken": "42"}
        )
        self.assertEqual(
            self.check_value(Decimal("1.230"), "decimal", "numeric", 1700),
            {"decimalToken": "1.230"},
        )
        with self.assertRaises(SessionError):
            self.check_value(True, "integer", "int4", 23)
        with self.assertRaises(SessionError):
            self.check_value(42, "integer", "int8", 23)
        with self.assertRaises(SessionError):
            self.check_value(Decimal("NaN"), "decimal", "numeric", 1700)

    def test_date_instant_uuid_and_bits128_keep_exact_native_profiles(self):
        self.assertEqual(
            self.check_value(date(2026, 11, 4), "date", "date", 1082),
            {"date": "2026-11-04"},
        )
        self.assertEqual(
            self.check_value(
                datetime(2026, 11, 4, 12, 0, tzinfo=UTC),
                "timestamp",
                "timestamptz",
                1184,
            ),
            {"timestamp": "2026-11-04T12:00:00.000000Z"},
        )
        with self.assertRaises(SessionError):
            self.check_value(
                datetime(2026, 11, 4, 12, 0), "timestamp", "timestamptz", 1184
            )
        value = UUID("00112233-4455-6677-8899-aabbccddeeff")
        self.assertEqual(
            self.check_value(value, "uuid", "uuid", 2950), {"uuid": str(value)}
        )
        self.assertEqual(
            self.check_value(bytes(range(16)), "bits128", "bytea", 17),
            {"bits128Hex": bytes(range(16)).hex()},
        )
        with self.assertRaises(SessionError):
            self.check_value(bytes(range(15)), "bits128", "bytea", 17)

    def test_nullability_and_oid_drift_are_checked(self):
        self.assertIsNone(
            generated_read_value_from_native(
                None,
                {"carrier": "string", "nullable": True},
                {"kind": "text"},
                25,
            )
        )
        with self.assertRaises(SessionError):
            self.check_value("x", "string", "text", 1043)
        with self.assertRaises(SessionError):
            generated_read_value_from_native(
                None,
                {"carrier": "string", "nullable": False},
                {"kind": "text"},
                25,
            )


if __name__ == "__main__":
    unittest.main()
