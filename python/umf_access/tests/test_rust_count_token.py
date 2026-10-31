# SPDX-License-Identifier: MIT OR Apache-2.0
"""Private bounded Rust predicate for declared count tokens."""
import unittest
from unittest.mock import patch

from umf import rust_operation_values
from umf_access.unified.operation_values import (
    _count_token_nonnegative_rust,
    value_from_native,
)
from umf_access.unified.session_policy import SessionError


class RustCountToken(unittest.TestCase):
    def test_nonnegative_integer_subset_and_ordinary_integer_separation(self):
        classify = rust_operation_values.operation_native_token_classify
        for token in ("0", "1", "98765432101234567890"):
            with self.subTest(token=token):
                self.assertTrue(_count_token_nonnegative_rust(token))
                self.assertEqual(classify("integer", token), "accepted")
        for token in ("-0", "-1", "01", "", "+1"):
            with self.subTest(token=token):
                self.assertFalse(_count_token_nonnegative_rust(token))
        self.assertEqual(classify("integer", "-1"), "accepted")

    def test_exact_input_and_explicit_profile_refusals(self):
        with self.assertRaisesRegex(SessionError, "exact native count token"):
            _count_token_nonnegative_rust(type("Token", (str,), {})("1"))
        with (
            patch.object(
                rust_operation_values,
                "operation_count_token_profile_version",
                return_value="umf-operation-count-token/0.0.0",
            ),
            self.assertRaisesRegex(SessionError, "profile mismatch"),
        ):
            _count_token_nonnegative_rust("1")

    def test_native_decode_precedes_count_sign_decision(self):
        output = {"nullable": False, "carrier": "integer"}
        negative = value_from_native("-0", output)
        self.assertEqual(negative, {"integerToken": "-0"})
        self.assertFalse(_count_token_nonnegative_rust(negative["integerToken"]))
        with self.assertRaisesRegex(SessionError, "native result value differs"):
            value_from_native("01", output)
        with (
            patch.object(
                rust_operation_values,
                "operation_count_token_profile_version",
                side_effect=AttributeError("missing"),
            ),
            self.assertRaisesRegex(SessionError, "capability unavailable"),
        ):
            _count_token_nonnegative_rust("1")

    def test_native_failure_and_non_boolean_response_do_not_fallback(self):
        with (
            patch.object(
                rust_operation_values,
                "operation_count_token_nonnegative",
                side_effect=RuntimeError("native failure"),
            ),
            self.assertRaisesRegex(RuntimeError, "native failure"),
        ):
            _count_token_nonnegative_rust("1")
        with (
            patch.object(
                rust_operation_values,
                "operation_count_token_nonnegative",
                return_value=1,
            ),
            self.assertRaisesRegex(RuntimeError, "invalid native count-token decision"),
        ):
            _count_token_nonnegative_rust("1")


if __name__ == "__main__":
    unittest.main()
