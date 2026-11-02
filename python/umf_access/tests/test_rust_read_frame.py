# SPDX-License-Identifier: MIT OR Apache-2.0
"""Private post-host read-frame parity and host-observation controls."""
import unittest
from unittest.mock import patch

from umf import rust_values
from umf_access.unified.operation_values import (
    _read_frame_cardinality_rust,
    _read_frame_shape_rust,
    result_frame,
    value_from_native,
)
from umf_access.unified.session_policy import SessionError


class RustReadFrame(unittest.TestCase):
    def test_shape_refusal_messages_match_result_frame(self):
        with self.assertRaisesRegex(SessionError, "native count cardinality differs"):
            _read_frame_shape_rust("count", 1, [])
        with self.assertRaisesRegex(SessionError, "native count cardinality differs"):
            _read_frame_shape_rust("count", 1, [()])
        with self.assertRaisesRegex(SessionError, "native result arity differs"):
            _read_frame_shape_rust("many", 2, [(1, 2), (3,)])
        _read_frame_shape_rust("many", 2, [(1, 2), (3, 4)])

    def test_dynamic_width_reads_short_circuit_later_rows(self):
        observed = []

        class Row:
            def __init__(self, index, width, error=None):
                self.index = index
                self.width = width
                self.error = error

            def __len__(self):
                observed.append(self.index)
                if self.error is not None:
                    raise self.error
                return self.width

        later_error = RuntimeError("later row should not be inspected")
        rows = [Row(0, 2), Row(1, 1), Row(2, 2, later_error)]
        with self.assertRaisesRegex(SessionError, "native result arity differs"):
            _read_frame_shape_rust("many", 2, rows)
        self.assertEqual(observed, [0, 1])

    def test_host_row_error_is_rethrown_by_identity(self):
        class Row:
            def __init__(self, error):
                self.error = error

            def __len__(self):
                raise self.error

        original = RuntimeError("host row width failure")
        with self.assertRaises(RuntimeError) as caught:
            _read_frame_shape_rust("many", 2, [Row(original)])
        self.assertIs(caught.exception, original)

        class BrokenIterator:
            def __iter__(self):
                return self

            def __next__(self):
                raise original

        with self.assertRaises(RuntimeError) as caught:
            _read_frame_shape_rust("many", 2, BrokenIterator())
        self.assertIs(caught.exception, original)

    def test_count_host_read_order_matches_predecessor(self):
        events = []

        class Row:
            def __len__(self):
                events.append("row width")
                return 1

        class Rows:
            def __len__(self):
                events.append("rows length")
                return 1

            def __getitem__(self, index):
                events.append(("row index", index))
                return Row()

        _read_frame_shape_rust("count", 1, Rows())
        self.assertEqual(events, ["rows length", ("row index", 0), "row width"])

    def test_cardinality_runs_as_a_separate_post_decode_stage(self):
        events = []

        def decode(row):
            events.append(("decode", row))
            return row

        decoded = [decode(row) for row in (0, 1)]
        with self.assertRaisesRegex(SessionError, "native result row bound exceeded"):
            _read_frame_cardinality_rust("many", len(decoded), 1)
        self.assertEqual(events, [("decode", 0), ("decode", 1)])

    def test_cardinality_boundaries_for_each_result_kind(self):
        cases = (
            ("one", 1, ((0, "required_row_missing"), (1, "admitted"), (2, "single_row_exceeded"))),
            ("optional", 1, ((0, "admitted"), (1, "admitted"), (2, "single_row_exceeded"))),
            ("many", 2, ((0, "admitted"), (2, "admitted"), (3, "row_bound_exceeded"))),
            ("page", 2, ((0, "admitted"), (2, "admitted"), (3, "admitted"), (4, "page_bound_exceeded"))),
        )
        for kind, bound, decisions in cases:
            with self.subTest(kind=kind):
                for row_count, expected in decisions:
                    with self.subTest(row_count=row_count):
                        if expected == "admitted":
                            _read_frame_cardinality_rust(kind, row_count, bound)
                        else:
                            with self.assertRaisesRegex(SessionError, {
                                "required_row_missing": "required row not found",
                                "single_row_exceeded": "native single-row cardinality exceeded",
                                "row_bound_exceeded": "native result row bound exceeded",
                                "page_bound_exceeded": "native page bound exceeded",
                            }[expected]):
                                _read_frame_cardinality_rust(kind, row_count, bound)

    def test_all_rows_decode_before_each_cardinality_refusal(self):
        cases = (
            ("one", 1, [("1",), ("invalid",)]),
            ("optional", 1, [("1",), ("invalid",)]),
            ("many", 1, [("1",), ("invalid",)]),
            ("page", 1, [("1",), ("2",), ("invalid",)]),
        )
        for kind, bound, rows in cases:
            program = {
                "module": "demo",
                "operation": "read",
                "binding": {"modelSha256": "a" * 64},
                "outputs": [{
                    "field": {"module": "demo", "element": "value"},
                    "nullable": False,
                    "carrier": "integer",
                }],
                "result": {"kind": kind, "maxRows": bound},
            }
            with self.subTest(kind=kind), self.assertRaisesRegex(
                SessionError, "native result value differs"
            ):
                result_frame(program, rows, {}, b"x" * 32)

    def test_page_cursor_metadata_and_final_size_keep_predecessor_order(self):
        events = []
        program = {
            "module": "demo",
            "operation": "page-read",
            "binding": {"modelSha256": "a" * 64},
            "outputs": [{
                "field": {"module": "demo", "element": "id"},
                "nullable": False,
                "carrier": "string",
            }],
            "result": {
                "kind": "page",
                "maxRows": 1,
                "cursor": {"fields": [{"module": "demo", "element": "id"}]},
            },
        }
        def observe_decode(value, output):
            events.append(("decode", value))
            return value_from_native(value, output)

        def observe_key(value, carrier):
            events.append(("cursor-key", value, carrier))
            return {"string": value}

        def observe_token(secret, scope, after):
            events.append(("cursor-token", after))
            return "signed-cursor"

        def observe_size(response):
            events.append("serialized-size")
            self.assertEqual(response["version"], "umf.table-read-result/0.1")
            self.assertEqual(response["module"], "demo")
            self.assertEqual(response["operation"], "page-read")
            self.assertEqual(response["sourceDigest"], "a" * 64)

        with (
            patch("umf_access.unified.operation_values.value_from_native", side_effect=observe_decode),
            patch("umf_access.unified.operation_values.key_literal", side_effect=observe_key),
            patch("umf_access.unified.operation_values.token_encode", side_effect=observe_token),
            patch("umf_access.unified.operation_values.bounded_size", side_effect=observe_size),
        ):
            response = result_frame(program, [("first",), ("lookahead",)], {"scope": 1}, b"x" * 32)

        self.assertEqual(events, [
            ("decode", "first"),
            ("decode", "lookahead"),
            ("cursor-key", "first", "string"),
            ("cursor-token", [{"string": "first"}]),
            "serialized-size",
        ])
        self.assertEqual(response["rows"], [{"id": "first"}])
        self.assertEqual(response["cursor"], "signed-cursor")

    def test_profile_mismatch_and_unavailable_remain_distinct(self):
        with (
            patch.object(rust_values, "access_stream_read_frame_profile_version", return_value="other"),
            self.assertRaisesRegex(SessionError, "capability profile mismatch"),
        ):
            _read_frame_shape_rust("many", 1, [])

        with (
            patch.object(rust_values, "access_stream_read_frame_profile_version", side_effect=AttributeError("missing")),
            self.assertRaisesRegex(SessionError, "capability unavailable"),
        ):
            _read_frame_shape_rust("many", 1, [])

        with (
            patch.object(rust_values, "access_stream_read_frame_profile_version", side_effect=RuntimeError("native failure")),
            self.assertRaisesRegex(RuntimeError, "native failure"),
        ):
            _read_frame_shape_rust("many", 1, [])

        with (
            patch.object(rust_values, "access_stream_read_frame_profile_version", return_value="other"),
            self.assertRaisesRegex(SessionError, "capability profile mismatch"),
        ):
            _read_frame_cardinality_rust("many", 0, 1)

        with (
            patch.object(rust_values, "access_stream_read_frame_profile_version", side_effect=AttributeError("missing")),
            self.assertRaisesRegex(SessionError, "capability unavailable"),
        ):
            _read_frame_cardinality_rust("many", 0, 1)


if __name__ == "__main__":
    unittest.main()
