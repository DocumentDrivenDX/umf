from __future__ import annotations

import unittest
from typing import cast

from umf_access_generated_executor import GeneratedExecutionError
from umf_access_generated_executor._codec import run_issued_codec


def make_codec(
    carrier: str,
    *,
    scale: int | None = None,
    precision: int | None = None,
    refinements: dict[str, object] | None = None,
    nullable: bool = False,
) -> dict[str, object]:
    wrappers = {
        "boolean": "boolean",
        "string": "string",
        "float": "floatToken",
        "integer": "integerToken",
        "decimal": "decimalToken",
    }
    profiles = {
        "boolean": "weft.boolean/1",
        "string": "weft.string/1",
        "float": "weft.finite-ascii-f64-token/1",
        "integer": "weft.exact-coefficient/1",
        "decimal": "weft.exact-coefficient/1",
    }
    modes = {
        "boolean": "identity",
        "string": "identity",
        "float": "preserve-float-token",
        "integer": "canonical-integer-decimal",
        "decimal": "canonical-scaled-decimal",
    }
    limit = (
        128
        if carrier == "float"
        else 4_000_000
        if carrier in {"integer", "decimal"}
        else None
    )
    return {
        "profile": "weft.query-codec-instructions/1",
        "steps": [
            {
                "op": "require-exact-wrapper",
                "wrapper": wrappers[carrier],
                "nullable": nullable,
            },
            {
                "op": "parse-carrier",
                "carrier": carrier,
                "profile": profiles[carrier],
                "scale": 0 if carrier == "integer" else scale,
                "precision": precision,
                "maxTokenBytes": limit,
            },
            {
                "op": "check-refinements",
                "carrier": carrier,
                "length": None,
                "integerWidth": None,
                "range": None,
                "allowedIdentities": None,
                **(refinements or {}),
            },
            {
                "op": "normalize-native-query-value",
                "carrier": carrier,
                "mode": modes[carrier],
            },
        ],
    }


class IssuedCodecTests(unittest.TestCase):
    def test_string_wrapper_unicode_scalar_length_and_enum_are_exact(self):
        codec = make_codec(
            "string",
            refinements={
                "length": {"unit": "unicode-scalar", "min": 1, "max": 2},
                "allowedIdentities": [{"kind": "string", "value": "𝄞x"}],
            },
        )
        self.assertEqual(
            run_issued_codec(codec, {"string": "𝄞x"}, carrier="string", nullable=False),
            "𝄞x",
        )
        for value in (
            {"string": "𝄞xy"},
            {"string": "x"},
            {"string": "𝄞y"},
            {"string": "\ud800"},
        ):
            with self.subTest(value=value), self.assertRaises(GeneratedExecutionError):
                run_issued_codec(codec, value, carrier="string", nullable=False)

    def test_integer_exact_coefficient_and_width_refusals(self):
        codec = make_codec(
            "integer",
            scale=0,
            precision=None,
            refinements={
                "integerWidth": {"bits": 64, "signed": True},
                "range": {
                    "minCoefficient": "-5",
                    "minInclusive": True,
                    "maxCoefficient": "9007199254740993",
                    "maxInclusive": True,
                },
            },
        )
        self.assertEqual(
            run_issued_codec(
                codec,
                {"integerToken": "9007199254740993"},
                carrier="integer",
                nullable=False,
            ),
            "9007199254740993",
        )
        self.assertEqual(
            run_issued_codec(
                codec, {"integerToken": "1.00e3"}, carrier="integer", nullable=False
            ),
            "1000",
        )
        self.assertEqual(
            run_issued_codec(
                codec, {"integerToken": "-0"}, carrier="integer", nullable=False
            ),
            "0",
        )
        for token in (
            "1.5",
            "01",
            "1e-1",
            "1e4000001",
            "1e+",
            "1.",
            "1E2E3",
            "0e+",
            "0eNO",
        ):
            with self.subTest(token=token), self.assertRaises(GeneratedExecutionError):
                run_issued_codec(
                    codec, {"integerToken": token}, carrier="integer", nullable=False
                )
        decimal_width = make_codec(
            "decimal",
            scale=2,
            precision=8,
            refinements={"integerWidth": {"bits": 8, "signed": True}},
        )
        self.assertEqual(
            run_issued_codec(
                decimal_width,
                {"decimalToken": "1.27"},
                carrier="decimal",
                nullable=False,
            ),
            "127e-2",
        )
        zero_with_long_valid_exponent = make_codec("integer")
        self.assertEqual(
            run_issued_codec(
                zero_with_long_valid_exponent,
                {"integerToken": "0e" + "0" * 33},
                carrier="integer",
                nullable=False,
            ),
            "0",
        )
        broad_width = make_codec(
            "integer", refinements={"integerWidth": {"bits": 4097, "signed": True}}
        )
        self.assertEqual(
            run_issued_codec(
                broad_width, {"integerToken": "1"}, carrier="integer", nullable=False
            ),
            "1",
        )
        with self.assertRaises(GeneratedExecutionError):
            run_issued_codec(
                decimal_width,
                {"decimalToken": "1.28"},
                carrier="decimal",
                nullable=False,
            )

    def test_decimal_scale_precision_and_native_normalization(self):
        codec = make_codec("decimal", scale=2, precision=8)
        vectors = {
            "1.230": "123e-2",
            "1.00e3": "1e3",
            "-0.00": "0",
        }
        for token, expected in vectors.items():
            with self.subTest(token=token):
                self.assertEqual(
                    run_issued_codec(
                        codec,
                        {"decimalToken": token},
                        carrier="decimal",
                        nullable=False,
                    ),
                    expected,
                )
        for token in ("1.231", "1e4000001", "01.00", ".5", "1."):
            with self.subTest(token=token), self.assertRaises(GeneratedExecutionError):
                run_issued_codec(
                    codec, {"decimalToken": token}, carrier="decimal", nullable=False
                )

    def test_float_finiteness_signed_zero_identity_and_original_token(self):
        codec = make_codec(
            "float",
            refinements={
                "allowedIdentities": [
                    {"kind": "float64Bits", "value": "0000000000000000"}
                ]
            },
        )
        for token in ("0", "-0", "0.0"):
            self.assertEqual(
                run_issued_codec(
                    codec, {"floatToken": token}, carrier="float", nullable=False
                ),
                token,
            )
        for token in ("NaN", "Infinity", "1e4000", " 1.0", "1_0"):
            with self.subTest(token=token), self.assertRaises(GeneratedExecutionError):
                run_issued_codec(
                    codec, {"floatToken": token}, carrier="float", nullable=False
                )

    def test_boolean_null_and_unknown_or_mismatched_instruction_refusals(self):
        codec = make_codec("boolean", nullable=True)
        self.assertIsNone(
            run_issued_codec(codec, None, carrier="boolean", nullable=True)
        )
        self.assertIs(
            run_issued_codec(
                codec, {"boolean": False}, carrier="boolean", nullable=True
            ),
            False,
        )
        with self.assertRaises(GeneratedExecutionError):
            run_issued_codec(
                codec, {"string": "false"}, carrier="boolean", nullable=True
            )
        extra = make_codec("string")
        cast(dict[str, object], cast(list[object], extra["steps"])[1])["future"] = True
        with self.assertRaises(GeneratedExecutionError):
            run_issued_codec(
                extra, {"string": "safe"}, carrier="string", nullable=False
            )
        with self.assertRaises(GeneratedExecutionError):
            run_issued_codec(
                make_codec("string"), {"string": "x"}, carrier="integer", nullable=False
            )


if __name__ == "__main__":
    unittest.main()
