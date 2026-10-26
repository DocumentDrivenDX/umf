# SPDX-License-Identifier: MIT OR Apache-2.0
"""Private post-host read-frame parity and host-observation controls."""
import unittest
from unittest.mock import patch

from umf import rust_values
from umf_access.unified.operation_values import (
    _read_frame_cardinality_rust,
    _read_frame_shape_rust,
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

    def test_all_rows_decode_before_a_cardinality_refusal(self):
        output = {"nullable": False, "carrier": "integer"}
        with self.assertRaisesRegex(SessionError, "native result value differs"):
            [value_from_native(token, output) for token in ("1", "invalid")]

    def test_profile_mismatch_and_unavailable_remain_distinct(self):
        with patch.object(rust_values, "access_stream_read_frame_profile_version", return_value="other"):
            with self.assertRaisesRegex(SessionError, "capability profile mismatch"):
                _read_frame_shape_rust("many", 1, [])

        with patch.object(rust_values, "access_stream_read_frame_profile_version", side_effect=AttributeError("missing")):
            with self.assertRaisesRegex(SessionError, "capability unavailable"):
                _read_frame_shape_rust("many", 1, [])

        with patch.object(rust_values, "access_stream_read_frame_profile_version", side_effect=RuntimeError("native failure")):
            with self.assertRaisesRegex(RuntimeError, "native failure"):
                _read_frame_shape_rust("many", 1, [])


if __name__ == "__main__":
    unittest.main()
