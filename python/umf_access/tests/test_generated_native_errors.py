# SPDX-License-Identifier: MIT OR Apache-2.0
"""Closed, diagnostic-free native refusal codes for generated requests."""

from __future__ import annotations

import unittest

from umf_access.generated import GeneratedNativeError
from umf_access.unified import SessionError
from umf_access.unified.generated_binding import _generated_native_error


class _NativeFailure(Exception):
    def __init__(self, sqlstate: str, diagnostic: str) -> None:
        self.sqlstate = sqlstate
        super().__init__(diagnostic)


class GeneratedNativeErrorTests(unittest.TestCase):
    def test_known_native_sqlstates_map_to_the_fixed_public_codes(self) -> None:
        cases = {
            "42501": "DENIED",
            "22012": "LIMIT_EXCEEDED",
            "23514": "PRECONDITION_FAILED",
            "42P01": "SCHEMA_MISMATCH",
            "42703": "SCHEMA_MISMATCH",
            "57014": "BUSY",
        }
        for sqlstate, expected in cases.items():
            with self.subTest(sqlstate=sqlstate):
                failure = _generated_native_error(
                    _NativeFailure(sqlstate, "private native diagnostic")
                )
                self.assertIs(type(failure), GeneratedNativeError)
                self.assertEqual(failure.code, expected)
                self.assertEqual(str(failure), expected)
                self.assertNotIn("private native diagnostic", str(failure))

    def test_unknown_native_and_session_errors_are_busy_without_diagnostics(self) -> None:
        for error in (
            _NativeFailure("XX000", "private server detail"),
            SessionError("private session detail"),
        ):
            with self.subTest(error_type=type(error).__name__):
                failure = _generated_native_error(error)
                self.assertEqual(failure.code, "BUSY")
                self.assertEqual(str(failure), "BUSY")

    def test_error_constructor_rejects_codes_outside_the_closed_vocabulary(self) -> None:
        with self.assertRaises(ValueError):
            GeneratedNativeError("42P01")  # type: ignore[arg-type]

    def test_error_code_is_read_only(self) -> None:
        failure = GeneratedNativeError("DENIED")
        with self.assertRaises(AttributeError):
            failure.code = "BUSY"  # type: ignore[misc]


if __name__ == "__main__":
    unittest.main()
