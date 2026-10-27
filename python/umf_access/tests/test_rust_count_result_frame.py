# SPDX-License-Identifier: MIT OR Apache-2.0
"""The exact count result DTO and Rust-owned final frame decision."""
import unittest
from unittest.mock import patch

from umf import rust_operation_values
from umf_access.unified.operation_values import _count_result_frame_rust, result_frame
from umf_access.unified.session_policy import SessionError


class RustCountResultFrame(unittest.TestCase):
    def setUp(self):
        self.program = {
            "module": "demo", "operation": "count",
            "binding": {"modelSha256": "a" * 64},
            "outputs": [{"carrier": "integer", "nullable": False}],
            "result": {"kind": "count", "maxRows": 1},
        }

    def test_binding_profile_and_exact_count_result_shape(self):
        self.assertEqual(
            rust_operation_values.operation_count_result_frame_profile_version(),
            "umf-operation-count-result-frame/0.1.0",
        )
        self.assertEqual(
            result_frame(self.program, [("9007199254740993",)], {}, b"x" * 32),
            {"kind": "count", "count": {"integerToken": "9007199254740993"},
             "version": "umf.table-read-result/0.1", "module": "demo",
             "operation": "count", "sourceDigest": "a" * 64},
        )

    def test_bounded_rust_serialization_matches_python_canonical_utf8(self):
        program = dict(self.program)
        program["module"] = "é\x01雪"
        program["operation"] = "line\nbreak"
        expected = __import__("json").dumps(
            {"kind": "count", "count": {"integerToken": "1"},
             "version": "umf.table-read-result/0.1", "module": program["module"],
             "operation": program["operation"], "sourceDigest": "a" * 64},
            ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False,
        )
        self.assertEqual(_count_result_frame_rust(program, "1"), expected)

    def test_cardinality_precedes_host_decode_and_rust_call(self):
        with (
            patch("umf_access.unified.operation_values.value_from_native", side_effect=AssertionError("decoded")),
            self.assertRaisesRegex(SessionError, "native count cardinality differs"),
        ):
            result_frame(self.program, [("1",), ("2",)], {}, b"x" * 32)

    def test_count_shape_does_not_read_output_count_before_rows(self):
        events = []

        class Row:
            def __len__(self):
                events.append("row width")
                return 1

            def __getitem__(self, index):
                events.append(("row value", index))
                return "1"

        class Rows:
            def __len__(self):
                events.append("rows length")
                return 1

            def __getitem__(self, index):
                events.append(("row index", index))
                return Row()

        class Outputs:
            def __len__(self):
                events.append("outputs length")
                raise AssertionError("outputs length was read")

            def __getitem__(self, index):
                events.append(("output index", index))
                return {"nullable": False, "carrier": "integer"}

        program = dict(self.program, outputs=Outputs())
        result_frame(program, Rows(), {}, b"x" * 32)
        self.assertEqual(events, [
            "rows length", ("row index", 0), "row width",
            ("row index", 0), ("row value", 0), ("output index", 0),
        ])

    def test_decode_precedes_negative_decision_and_frame_errors_stay_exact(self):
        with self.assertRaisesRegex(SessionError, "native result value differs from its declared carrier"):
            result_frame(self.program, [("01",)], {}, b"x" * 32)
        with self.assertRaisesRegex(SessionError, "native count is negative"):
            result_frame(self.program, [("-0",)], {}, b"x" * 32)
        missing_metadata = {"outputs": self.program["outputs"],
                            "result": self.program["result"]}
        with self.assertRaisesRegex(SessionError, "native count is negative"):
            result_frame(missing_metadata, [("-1",)], {}, b"x" * 32)
        large = dict(self.program)
        large["module"] = "x" * (8 * 1024 * 1024)
        with self.assertRaisesRegex(SessionError, "native wire frame bound exceeded"):
            result_frame(large, [("0",)], {}, b"x" * 32)

    def test_versioned_binding_refuses_non_builtin_text(self):
        class Subclass(str):
            pass
        with self.assertRaisesRegex(ValueError, "exact count result text required"):
            rust_operation_values.operation_count_result_frame("demo", "count", "a" * 64, Subclass("1"))
        with (
            patch.object(rust_operation_values, "operation_count_result_frame_profile_version", return_value="wrong"),
            self.assertRaisesRegex(SessionError, "profile mismatch"),
        ):
            result_frame(self.program, [("1",)], {}, b"x" * 32)


if __name__ == "__main__":
    unittest.main()
