# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent stdlib oracle for the Rust operation-values subset."""
import base64
import hashlib
import hmac
import json
import unittest

from umf import rust_operation_values
from umf_access.unified import SessionError
from umf_access.unified.operation_values import (
    bounded_size,
    canonical,
    digest,
    loads,
    token_decode,
    token_encode,
)


class RustOperationValues(unittest.TestCase):
    def test_profile_and_builtin_canonical_bytes_match_stdlib_oracle(self):
        self.assertEqual(
            rust_operation_values.operation_values_profile_version(),
            "umf-operation-values/0.1.0",
        )
        values = [
            None, True, 0, -(1 << 300), 1.0, -0.0, 1e-7, 1e20,
            {"雪": "\x01", "items": ["a", 2, False]},
            {"é": 1, "e": 2},
        ]
        for value in values:
            with self.subTest(value=repr(value)):
                expected = json.dumps(
                    value, ensure_ascii=False, sort_keys=True,
                    separators=(",", ":"), allow_nan=False,
                )
                self.assertEqual(canonical(value), expected)
                self.assertEqual(bounded_size(value), len(expected.encode("utf-8")))
                self.assertEqual(digest(value), hashlib.sha256(expected.encode()).hexdigest())

    def test_rust_strict_loads_preserves_input_object_order(self):
        raw = '{"z":1,"a":2,"array":[true,null]}'
        self.assertEqual(list(loads(raw)), ["z", "a", "array"])
        for key in ('$serde_json::private::Number', '\\u0024serde_json::private::Number'):
            source = '{"' + key + '":"12"}'
            self.assertEqual(canonical(loads(source)), '{"$serde_json::private::Number":"12"}')
        for invalid in (
            '{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}',
            '{"a":-Infinity}', '{',
        ):
            with self.subTest(raw=invalid), self.assertRaises(SessionError):
                loads(invalid)

    def test_rust_cursor_matches_independent_hmac_and_base64_oracle(self):
        secret = b"x" * 32
        scope = {"operation": "page", "unicode": "雪"}
        after = [{"integerToken": "9007199254740993"}]
        payload = {"version": "umf.table-cursor/0.1", "scope": scope, "after": after}
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        encoded = base64.urlsafe_b64encode(raw.encode()).rstrip(b"=").decode("ascii")
        expected = encoded + "." + hmac.new(secret, encoded.encode("ascii"), hashlib.sha256).hexdigest()
        actual = token_encode(secret, scope, after)
        self.assertEqual(actual, expected)
        self.assertEqual(token_decode(secret, actual), json.loads(raw))
        for invalid in ("", "raw-key", actual + ".extra", "x" * 16_385):
            with self.subTest(token=invalid[:16]), self.assertRaises(SessionError):
                token_decode(secret, invalid)
        with self.assertRaises(SessionError):
            token_decode(b"y" * 32, actual)

    def test_signed_noncanonical_cursor_preserves_scope_insertion_order(self):
        secret = b"order-preserving secret"
        raw = (
            '{"after":[],"scope":{"z":1,"a":2},'
            '"version":"umf.table-cursor/0.1"}'
        )
        encoded = base64.urlsafe_b64encode(raw.encode()).rstrip(b"=").decode("ascii")
        signature = hmac.new(secret, encoded.encode("ascii"), hashlib.sha256).hexdigest()
        decoded = token_decode(secret, encoded + "." + signature)
        self.assertEqual(list(decoded["scope"]), ["z", "a"])

    def test_rust_cursor_capacity_and_frame_bound(self):
        with self.assertRaisesRegex(SessionError, "cursor capacity exceeded"):
            token_encode(b"x" * 32, {}, [{"string": "x" * 16_384}])
        with self.assertRaisesRegex(SessionError, "native wire frame bound exceeded"):
            bounded_size([{("x" * 2000): "a"} for _ in range(5000)])

    def test_rust_bounded_size_refuses_unsupported_host_objects(self):
        class DictSubclass(dict):
            pass

        with self.assertRaisesRegex(SessionError, "invalid operation JSON"):
            bounded_size(DictSubclass(value="x"))
        nested = None
        for _ in range(129):
            nested = [nested]
        with self.assertRaisesRegex(SessionError, "native wire frame bound exceeded"):
            bounded_size(nested)
        with self.assertRaisesRegex(SessionError, "native wire frame bound exceeded"):
            bounded_size("x", -1)

    def test_bounded_size_accepts_arbitrary_precision_limits(self):
        self.assertEqual(bounded_size(None, 10 ** 100), 4)
        with self.assertRaisesRegex(SessionError, "native wire frame bound exceeded"):
            bounded_size(None, -(10 ** 100))


if __name__ == "__main__":
    unittest.main()
