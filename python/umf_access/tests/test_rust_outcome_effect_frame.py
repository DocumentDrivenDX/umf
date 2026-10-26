# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in post-authentication receipt effect-frame admission controls."""
import unittest
import math
import re
from unittest.mock import patch

from umf_access.unified.outcome_values import _outcome_effect_frame_admit_rust
from umf_access.unified.session_policy import SessionError
from umf import rust_outcome_values as native_outcome_values


def frame(effects, response_digest="a" * 64):
    return {"version": "umf.table-outcome/0.1", "responseDigest": response_digest, "effects": effects}


class RustOutcomeEffectFrame(unittest.TestCase):
    @staticmethod
    def predecessor(value, items, max_rows):
        if (type(value.get("responseDigest")) is not str
                or re.fullmatch(r"[a-f0-9]{64}", value["responseDigest"]) is None
                or type(value.get("effects")) is not list
                or len(value["effects"]) != items):
            return "stored outcome is invalid"
        for count in value["effects"]:
            if (type(count) is not dict or set(count) != {"integerToken"}
                    or type(count["integerToken"]) is not str
                    or re.fullmatch(r"0|[1-9][0-9]{0,4}", count["integerToken"]) is None
                    or int(count["integerToken"]) > max_rows):
                return "stored outcome count differs from the declared bound"
        return None

    @staticmethod
    def rust_result(value, items, max_rows):
        try:
            _outcome_effect_frame_admit_rust(value, items, max_rows)
        except SessionError as error:
            return str(error)
        return None

    def test_closed_effect_frames_admit_exact_tokens(self):
        for value, items, max_rows in (
            (frame([{"integerToken": "0"}, {"integerToken": "100"}]), 2, 100),
            (frame([]), 0, 0),
        ):
            self.assertEqual(self.rust_result(value, items, max_rows), self.predecessor(value, items, max_rows))

    def test_post_authentication_refusal_messages_and_order(self):
        invalid = "stored outcome is invalid"
        count = "stored outcome count differs from the declared bound"
        bad_frames = [
            (frame([], "A" * 64), 0, 100),
            (frame({}, "a" * 64), 0, 100),
            (frame([{"integerToken": "1"}], "a" * 64), 0, 100),
        ]
        for value, items, max_rows in bad_frames:
            with self.subTest(value=value):
                self.assertEqual(self.rust_result(value, items, max_rows), invalid)

        bad_counts = [
            "01", "-1", "+1", "1.0", "100000", "101",
        ]
        for token in bad_counts:
            value=frame([{"integerToken": token}])
            with self.subTest(token=token):
                self.assertEqual(self.rust_result(value, 1, 100), count)
        for effect in (1, {}, {"integerToken": 1}, {"integerToken": "1", "extra": 0}):
            value=frame([effect])
            with self.subTest(effect=effect):
                self.assertEqual(self.rust_result(value, 1, 100), count)

    def test_exact_input_profile_refuses_non_json_or_non_exact_bounds(self):
        class DictSubclass(dict):
            pass

        cases = (
            (frame([]), True, 10, "exact integer bounds"),
            (frame([]), 0, False, "exact integer bounds"),
            (frame([{"integerToken": "1", "nested": DictSubclass()}]), 1, 10, "non-JSON values"),
            (frame([{"integerToken": "1", "nested": math.inf}]), 1, 10, "non-finite"),
            (frame([{"integerToken": "1", "nested": "\ud800"}]), 1, 10, "Unicode scalar"),
            (frame([{"integerToken": "1", "nested": 2**64}]), 1, 10, "out-of-range JSON integers"),
            (frame([{"integerToken": "1", "a": {}, "b": {}}]), 1, 10, "repeated/cyclic"),
        )
        for value, items, max_rows, reason in cases:
            if reason == "repeated/cyclic":
                shared={};value["effects"][0]["a"]=shared;value["effects"][0]["b"]=shared
            with self.subTest(items=items, max_rows=max_rows, reason=reason), self.assertRaisesRegex(SessionError, reason):
                _outcome_effect_frame_admit_rust(value, items, max_rows)

        cycle = frame([])
        cycle["cycle"] = cycle
        with self.assertRaisesRegex(SessionError, "repeated/cyclic"):
            _outcome_effect_frame_admit_rust(cycle, 0, 10)

    def test_low_level_text_operation_rejects_duplicate_json_members(self):
        duplicate = (
            '{"responseDigest":"' + "a" * 64
            + '","effects":[],"effects":[]}'
        )
        with self.assertRaisesRegex(ValueError, "invalid outcome effect-frame JSON"):
            native_outcome_values.effect_frame_admission(duplicate, 0, 10,
                "umf-r6-outcome-effect-frame/0.1.0")
        with self.assertRaisesRegex(ValueError, "unsupported outcome effect-frame profile"):
            native_outcome_values.effect_frame_admission("{}", 0, 10, "other-profile")

    def test_profile_handshake_distinguishes_mismatch_from_unavailable(self):
        with patch.object(native_outcome_values, "effect_frame_profile_version", return_value="other-profile"):
            with self.assertRaisesRegex(SessionError, "capability profile mismatch"):
                _outcome_effect_frame_admit_rust(frame([]), 0, 10)

        with patch.object(native_outcome_values, "effect_frame_profile_version", side_effect=AttributeError("missing")):
            with self.assertRaisesRegex(SessionError, "capability unavailable"):
                _outcome_effect_frame_admit_rust(frame([]), 0, 10)

        with patch.object(native_outcome_values, "effect_frame_profile_version", side_effect=RuntimeError("crypto profile mismatch")):
            with self.assertRaisesRegex(RuntimeError, "crypto profile mismatch"):
                _outcome_effect_frame_admit_rust(frame([]), 0, 10)


if __name__ == "__main__":
    unittest.main()
