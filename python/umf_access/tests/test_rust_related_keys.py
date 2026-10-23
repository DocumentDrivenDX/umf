# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in related-Key parser parity at the existing Python codec boundary."""

from __future__ import annotations

import sys
import unittest

from commerce import OrderKey
from umf_access.related_keys import (
    decode_related_keys,
    decode_related_keys_rust,
    key_descriptor,
)
from umf_access.types import CodecError


class RustRelatedKeyParserTests(unittest.TestCase):
    def setUp(self) -> None:
        self.metadata = {
            "profile": "pg-related-keys-json/0.1",
            "bound": 2,
            "relationship": {"module": "commerce", "id": "parent", "direction": "forward"},
            "key": key_descriptor(OrderKey),
        }

    def test_opt_in_keeps_default_decoder_unchanged(self) -> None:
        text = '{"items":[["a"],["b"]],"truncated":true}'
        self.assertEqual(
            decode_related_keys_rust(text, self.metadata, OrderKey),
            decode_related_keys(text, self.metadata, OrderKey),
        )

    def test_parser_errors_keep_suppressed_inner_context(self) -> None:
        expected_context = {
            '{"items":[],"items":[],"truncated":false}': (
                "CodecError",
                "duplicate related-Key JSON member",
            ),
            '{"items":[[1]],"truncated":false}': (
                "CodecError",
                "related-Key numeric values require exact string tokens",
            ),
        }
        for text, context in expected_context.items():
            with self.subTest(text=text), self.assertRaises(CodecError) as caught:
                decode_related_keys_rust(text, self.metadata, OrderKey)
            error = caught.exception
            self.assertEqual(str(error), "invalid related-Key JSON text")
            self.assertIsNone(error.__cause__)
            self.assertTrue(error.__suppress_context__)
            self.assertEqual(type(error.__context__).__name__, context[0])
            self.assertEqual(str(error.__context__), context[1])

    def test_malformed_json_retains_versioned_decode_context(self) -> None:
        if sys.version_info[:2] == (3, 11):
            message = "Expecting property name enclosed in double quotes"
            position = 30
        elif sys.version_info[:2] == (3, 14):
            message = "Illegal trailing comma before end of object"
            position = 29
        else:
            self.skipTest("only the captured CPython 3.11 and 3.14 profiles are supported")
        text = '{"items":[],"truncated":false,}'
        with self.assertRaises(CodecError) as caught:
            decode_related_keys_rust(text, self.metadata, OrderKey)
        error = caught.exception
        self.assertIsNone(error.__cause__)
        self.assertTrue(error.__suppress_context__)
        self.assertEqual(type(error.__context__).__name__, "JSONDecodeError")
        self.assertEqual(error.__context__.msg, message)
        self.assertEqual(error.__context__.pos, position)

    def test_surrogates_and_deep_parser_controls(self) -> None:
        # The raw surrogate survives parsing and is rejected by Python-owned
        # Key validation with the same code point still present in context.
        text = '{"items":[["\\ud800"]],"truncated":false}'
        with self.assertRaises(CodecError):
            decode_related_keys_rust(text, self.metadata, OrderKey)

        deep = "[" * 1200 + "null" + "]" * 1200
        if sys.version_info[:2] == (3, 11):
            with self.assertRaises(RecursionError):
                decode_related_keys_rust(deep, self.metadata, OrderKey)
        elif sys.version_info[:2] == (3, 14):
            with self.assertRaisesRegex(CodecError, "closed related-Key JSON payload required"):
                decode_related_keys_rust(deep, self.metadata, OrderKey)
        else:
            self.skipTest("only the captured CPython 3.11 and 3.14 profiles are supported")

        # A failed deep call must release every recursive-call guard.
        with self.assertRaises(CodecError):
            decode_related_keys_rust(
                '{"items":[],"truncated":false}', self.metadata, OrderKey
            )

    def test_custom_and_ambient_recursion_budgets_are_honored(self) -> None:
        original_limit = sys.getrecursionlimit()
        try:
            sys.setrecursionlimit(240)
            ordinary_depth = "[" * 80 + "null" + "]" * 80
            with self.assertRaises(CodecError):
                decode_related_keys_rust(ordinary_depth, self.metadata, OrderKey)

            def recurse(depth: int) -> object:
                if depth == 0:
                    return decode_related_keys_rust(
                        ordinary_depth, self.metadata, OrderKey
                    )
                return recurse(depth - 1)

            with self.assertRaises(RecursionError):
                recurse(190)

            sys.setrecursionlimit(50)
            low_limit = "[" * 180 + "null" + "]" * 180
            if sys.version_info[:2] == (3, 11):
                with self.assertRaises(RecursionError):
                    decode_related_keys_rust(low_limit, self.metadata, OrderKey)
            else:
                # CPython 3.14 no longer maps this C recursion guard to the
                # configurable Python recursion limit; the divergence is
                # recorded in the R6 evidence and remains opt-in.
                with self.assertRaisesRegex(CodecError, "closed related-Key JSON payload required"):
                    decode_related_keys_rust(low_limit, self.metadata, OrderKey)
        finally:
            sys.setrecursionlimit(original_limit)

        # Both a later numeric token and unrelated trailing text remain behind
        # the earlier parser outcome, even when they contain deep openers.
        with self.assertRaises(CodecError) as numeric:
            decode_related_keys_rust(
                '{"items":[1],"truncated":false}' + "[" * 500,
                self.metadata,
                OrderKey,
            )
        self.assertEqual(
            str(numeric.exception.__context__),
            "related-Key numeric values require exact string tokens",
        )
        with self.assertRaises(CodecError) as malformed:
            decode_related_keys_rust(
                '{"items":[],"truncated":false} x' + "[" * 500,
                self.metadata,
                OrderKey,
            )
        self.assertEqual(type(malformed.exception.__context__).__name__, "JSONDecodeError")

    def test_common_shapes_continue_to_be_owned_by_python(self) -> None:
        for text in (
            "[]",
            "null",
            '{"items":[],"truncated":false,"future":true}',
            '{"items":[["a"]],"truncated":false}',
        ):
            with self.subTest(text=text), self.assertRaises(CodecError):
                decode_related_keys_rust(text, self.metadata, OrderKey)

    def test_large_text_and_flat_tree_have_no_new_parser_cap(self) -> None:
        from umf_access.rust_related_keys import loads

        large_text = "x" * 1_000_000
        self.assertEqual(loads('"' + large_text + '"'), large_text)
        flat = "[" + ",".join('"x"' for _ in range(20_000)) + "]"
        result = loads(flat)
        self.assertEqual(len(result), 20_000)
        self.assertEqual(result[0], "x")
        self.assertEqual(result[-1], "x")


if __name__ == "__main__":
    unittest.main()
