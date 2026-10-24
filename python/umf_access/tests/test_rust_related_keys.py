# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in related-Key parser parity at the existing Python codec boundary."""

from __future__ import annotations

import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

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

    def test_opt_in_and_default_produce_same_result(self) -> None:
        text = '{"items":[["a"],["b"]],"truncated":true}'
        self.assertEqual(
            decode_related_keys_rust(text, self.metadata, OrderKey),
            decode_related_keys(text, self.metadata, OrderKey),
        )

    def test_default_dispatches_to_rust_only_on_qualified_cpython_versions(self) -> None:
        text = '{"items":[["a"]],"truncated":false}'
        import umf_access.rust_related_keys as rust_parser

        if sys.implementation.name == "cpython" and sys.version_info[:2] in ((3, 11), (3, 14)):
            selected = rust_parser.loads_default if sys.version_info[:2] == (3, 11) else rust_parser.loads
            selected_name = "loads_default" if sys.version_info[:2] == (3, 11) else "loads"
            original = selected
            calls: list[str] = []

            def observed(value: str):
                calls.append(value)
                return original(value)

            with patch.object(rust_parser, selected_name, observed):
                self.assertEqual(decode_related_keys(text, self.metadata, OrderKey).items[0], OrderKey(order_id="a"))
            self.assertEqual(calls, [text])

        for name, version in (("cpython", (3, 12)), ("cpython", (3, 13)), ("pypy", (3, 11))):
            environment = SimpleNamespace(
                implementation=SimpleNamespace(name=name),
                version_info=version,
            )
            with patch("umf_access.related_keys.sys", environment), patch.object(
                rust_parser, "loads", side_effect=AssertionError("unqualified runtime called Rust")
            ):
                self.assertEqual(
                    decode_related_keys(text, self.metadata, OrderKey).items[0],
                    OrderKey(order_id="a"),
                )

    def test_capability_failure_is_deferred_and_maps_at_postgres_boundary(self) -> None:
        from umf_access.pages import ReadObligationUnmet
        from umf_access.postgres_read import _output_value
        import umf_access.rust_related_keys as rust_parser

        if sys.implementation.name != "cpython" or sys.version_info[:2] not in ((3, 11), (3, 14)):
            self.skipTest("default Rust parser is staged only for CPython 3.11 and 3.14")
        with patch.object(rust_parser, "profile_version", return_value="wrong-profile"):
            with self.assertRaises(CodecError):
                decode_related_keys("{}", {**self.metadata, "profile": "unknown"}, OrderKey)
            with self.assertRaisesRegex(CodecError, "related-Key native JSON text required"):
                decode_related_keys(3, self.metadata, OrderKey)
            with self.assertRaisesRegex(ReadObligationUnmet, "native related-Key decoder capability unavailable"):
                _output_value(
                    '{"items":[],"truncated":false}',
                    {"carrier": "related-keys", "decoder": self.metadata},
                    key_model=OrderKey,
                )
        with patch.object(rust_parser, "profile_version", side_effect=AttributeError("missing capability")):
            with self.assertRaisesRegex(ReadObligationUnmet, "native related-Key decoder capability unavailable"):
                _output_value(
                    '{"items":[],"truncated":false}',
                    {"carrier": "related-keys", "decoder": self.metadata},
                    key_model=OrderKey,
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
        # Raw lone surrogates remain ordinary Python code points in Key values.
        text = '{"items":[["\\ud800"]],"truncated":false}'
        result = decode_related_keys(text, self.metadata, OrderKey)
        self.assertEqual(tuple(map(ord, result.items[0].order_id)), (0xD800,))

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
        self.assertEqual(
            decode_related_keys_rust(
                '{"items":[],"truncated":false}', self.metadata, OrderKey
            ).items,
            (),
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

            if sys.version_info[:2] == (3, 11):
                with self.assertRaises(RecursionError):
                    recurse(190)
            else:
                with self.assertRaisesRegex(CodecError, "closed related-Key JSON payload required"):
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

    def test_direct_parser_recursion_threshold_tracks_json_loads(self) -> None:
        """Keep the opt-in guard aligned at a high ambient Python stack depth."""
        original_limit = sys.getrecursionlimit()
        try:
            sys.setrecursionlimit(250)
            outcomes: dict[str, tuple[int | None, str | None]] = {}
            for name, decoder in (
                ("python", decode_related_keys),
                ("rust", decode_related_keys_rust),
            ):
                first_error = None
                for container_depth in range(1, 221):
                    payload = "[" * container_depth + "null" + "]" * container_depth

                    def invoke():
                        return decoder(payload, self.metadata, OrderKey)

                    def ambient(depth: int):
                        return invoke() if depth == 0 else ambient(depth - 1)

                    try:
                        ambient(190)
                    except RecursionError as error:
                        first_error = (container_depth, str(error))
                        break
                    except CodecError:
                        pass
                outcomes[name] = first_error or (None, None)
            self.assertEqual(outcomes["rust"], outcomes["python"])
        finally:
            sys.setrecursionlimit(original_limit)

    def test_common_shapes_continue_to_be_owned_by_python(self) -> None:
        for text in (
            "[]",
            "null",
            '{"items":[],"truncated":false,"future":true}',
        ):
            with self.subTest(text=text), self.assertRaises(CodecError):
                decode_related_keys_rust(text, self.metadata, OrderKey)
        valid = decode_related_keys('{"items":[["a"]],"truncated":false}', self.metadata, OrderKey)
        self.assertEqual(valid.items, (OrderKey(order_id="a"),))

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
