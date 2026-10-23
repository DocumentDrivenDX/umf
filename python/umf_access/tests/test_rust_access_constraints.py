# SPDX-License-Identifier: MIT OR Apache-2.0
"""Frozen predecessor behavior and independent checks for Rust constraints."""

import unittest
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from typing import Annotated, ClassVar
from unittest.mock import patch

from pydantic import BeforeValidator

from umf_access.codec_support import decode_model, encode_model
from umf_access.types import StrictModel, ValueRuleError
from umf_access.values import FieldValidator, validate_allowed, validate_length


class ConstraintRecord(StrictModel):
    UMF_FINAL: ClassVar[bool] = True
    label: Annotated[
        str,
        BeforeValidator(
            FieldValidator(kind="string", minimum=2, maximum=4, allowed=("ok",))
        ),
    ]


CONSTRAINT_FIELDS = ({"python": "label", "field": "displayLabel", "kind": "identity", "item": None},)


class RustAccessConstraintTests(unittest.TestCase):
    def test_length_carriers_unicode_and_original_identity(self) -> None:
        for value, size in (("😀", 1), ("e\u0301", 2), (b"\xff", 1), ((1, 2), 2), ([1], 1), ({"x": 1}, 1)):
            with self.subTest(value=value):
                self.assertIs(validate_length(value, minimum=size, maximum=size), value)
        for value in ("😀", b"x", (1,), [1], {"x": 1}):
            with self.assertRaisesRegex(ValueRuleError, "^length outside authored bounds$"):
                validate_length(value, minimum=2)

    def test_length_minimum_before_maximum_and_short_circuit(self) -> None:
        events: list[str] = []

        class Bound:
            def __init__(self, name: str, result: bool, raises: bool = False) -> None:
                self.name, self.result, self.raises = name, result, raises

            def __gt__(self, other: object) -> bool:
                events.append(self.name)
                if self.raises:
                    raise RuntimeError(self.name)
                return self.result

        value = "x"
        with self.assertRaisesRegex(ValueRuleError, "^length outside authored bounds$"):
            validate_length(value, minimum=Bound("minimum", True), maximum=Bound("maximum", True))
        self.assertEqual(events, ["minimum"])
        events.clear()
        comparison_error = RuntimeError("same comparison object")

        class RaisingBound:
            def __gt__(self, other: object) -> bool:
                raise comparison_error

        with self.assertRaises(RuntimeError) as caught:
            validate_length(value, minimum=RaisingBound())
        self.assertIs(caught.exception, comparison_error)
        with self.assertRaisesRegex(RuntimeError, "^minimum$"):
            validate_length(value, minimum=Bound("minimum", False, True), maximum=Bound("maximum", True))
        self.assertEqual(events, ["minimum"])

    def test_length_truthiness_failure_is_preserved(self) -> None:
        error = RuntimeError("bound truth")

        class Truth:
            def __bool__(self) -> bool:
                raise error

        class Bound:
            def __gt__(self, other: object) -> Truth:
                return Truth()

        with self.assertRaises(RuntimeError) as caught:
            validate_length("x", minimum=Bound())
        self.assertIs(caught.exception, error)

    def test_allowed_exact_values_and_original_identity(self) -> None:
        cases = (
            (True, (True,)), (7, (7,)), (1 << 4096, (1 << 4096,)),
            ("é", ("e\u0301", "é")), (b"\xff", (b"\xff",)),
            (Decimal("1.200"), (Decimal("1.2"),)),
            (Decimal("-0.00"), (Decimal("0"),)),
        )
        for value, allowed in cases:
            with self.subTest(value_type=type(value).__name__, value=str(value)[:16]):
                self.assertIs(validate_allowed(value, allowed), value)
        for value, allowed in ((True, (1,)), (1, (True,)), (float("nan"), (float("nan"),)), (Decimal("NaN"), (Decimal("NaN"),))):
            with self.subTest(value_type=type(value).__name__):
                with self.assertRaisesRegex(ValueRuleError, "^value outside authored allowed values$"):
                    validate_allowed(value, allowed)
        value = "ok"
        self.assertIs(validate_allowed(value, ("\ud800", "ok")), value)

    def test_allowed_candidate_side_equality_order_and_truthiness(self) -> None:
        events: list[str] = []
        truth_error = RuntimeError("candidate truth")
        equality_error = RuntimeError("same equality object")

        class Candidate:
            def __init__(self, name: str, result: object) -> None:
                self.name, self.result = name, result

            def __eq__(self, other: object) -> object:
                events.append(self.name)
                if self.name == "raises":
                    raise equality_error
                return self.result

        value = Candidate("value", False)
        self.assertIs(validate_allowed(value, (Candidate("first", False), Candidate("second", True))), value)
        self.assertEqual(events, ["first", "second"])
        events.clear()
        with self.assertRaisesRegex(ValueRuleError, "^value outside authored allowed values$"):
            validate_allowed(value, (Candidate("first", False), Candidate("unreached", False)))
        self.assertEqual(events, ["first", "unreached"])

        class ErrorTruth:
            def __bool__(self) -> bool:
                raise truth_error

        truth_candidate = Candidate("truth", ErrorTruth())
        with self.assertRaises(RuntimeError) as caught:
            validate_allowed(value, (truth_candidate,))
        self.assertIs(caught.exception, truth_error)

        equality_candidate = Candidate("raises", False)
        with self.assertRaises(RuntimeError) as caught:
            validate_allowed(value, (equality_candidate,))
        self.assertIs(caught.exception, equality_error)

    def test_allowed_generator_and_decimal_signaling_nan(self) -> None:
        value = 2
        seen: list[int] = []

        def candidates():
            for item in (1, 2, 3):
                seen.append(item)
                yield item

        self.assertIs(validate_allowed(value, candidates()), value)  # type: ignore[arg-type]
        self.assertEqual(seen, [1, 2])
        with self.assertRaises(InvalidOperation):
            validate_allowed(Decimal("sNaN"), (Decimal("sNaN"),))

    def test_independent_fraction_equality_for_finite_decimals(self) -> None:
        values = (Decimal("-10.01"), Decimal("-0"), Decimal("0.000"), Decimal("1.2"), Decimal("1.200"), Decimal("1E+100"))
        for value in values:
            for candidate in values:
                same = Fraction(value) == Fraction(candidate)
                if same:
                    self.assertIs(validate_allowed(value, (candidate,)), value)
                else:
                    with self.assertRaisesRegex(ValueRuleError, "^value outside authored allowed values$"):
                        validate_allowed(value, (candidate,))

    def test_generated_field_validator_order_and_codec_round_trip(self) -> None:
        validator = FieldValidator(kind="string", minimum=2, maximum=4, allowed=("ok",))
        value = "ok"
        self.assertIs(validator(value), value)
        with self.assertRaisesRegex(ValueRuleError, "^length outside authored bounds$"):
            validator("x")

        model = ConstraintRecord(label="ok")
        self.assertEqual(encode_model(ConstraintRecord, model, CONSTRAINT_FIELDS), {"displayLabel": "ok"})
        decoded = decode_model(ConstraintRecord, ["displayLabel"], ["ok"], CONSTRAINT_FIELDS)
        self.assertEqual(decoded.label, "ok")
        with self.assertRaises(ValueError):
            decode_model(ConstraintRecord, ["displayLabel"], ["no"], CONSTRAINT_FIELDS)

    def test_raw_binding_refusals_and_minimum_short_circuit(self) -> None:
        from umf import _rust, rust_values

        native = _rust._rust_core
        self.assertEqual(
            rust_values.access_constraints_profile_version(),
            "umf-access-constraints/0.1.0",
        )
        with self.assertRaisesRegex(ValueError, "exact length carrier required"):
            native.access_constraints_length_within(True, None, None)
        with self.assertRaisesRegex(ValueError, "integer metadata required"):
            native.access_constraints_length_within(1, 1.5, None)
        with self.assertRaisesRegex(ValueError, "exact integer allowed-value carriers required"):
            native.access_constraints_equal_integer(True, 1)
        with self.assertRaisesRegex(ValueError, "exact boolean allowed-value carriers required"):
            native.access_constraints_equal_boolean(1, True)

        class BytesSubclass(bytes):
            pass

        with self.assertRaisesRegex(ValueError, "exact bytes allowed-value carriers required"):
            native.access_constraints_equal_bytes(BytesSubclass(b"x"), b"x")
        with self.assertRaises((ValueError, UnicodeError)):
            native.access_constraints_equal_text("\ud800", "\ud800")
        with self.assertRaisesRegex(ValueError, "invalid Decimal coefficient tuple"):
            native.access_constraints_equal_decimal((0, (), 0), (0, (0,), 0))

        # The raw call converts the maximum only if the exact minimum passed.
        self.assertFalse(native.access_constraints_length_within(0, 10, object()))
        with self.assertRaises(TypeError):
            native.access_constraints_length_within(0, None, None, meter=lambda _: None)

        with patch.object(rust_values, "access_constraints_profile_version", None):
            original = "x"
            self.assertIs(validate_length(original), original)
            with self.assertRaisesRegex(ValueRuleError, "required constraints profile"):
                validate_length("x", minimum=0)
            with self.assertRaisesRegex(ValueRuleError, "required constraints profile"):
                validate_allowed(1, (1,))


if __name__ == "__main__":
    unittest.main()
