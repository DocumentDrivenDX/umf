# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import time
import unittest
from unittest.mock import patch

from umf_codegen._native import GenerationError, _decode_cli_json_response


class CliJsonResponseTests(unittest.TestCase):
    def decode(self, raw: bytes):
        return _decode_cli_json_response(raw, time.monotonic() + 5)

    def test_ecmascript_number_tokens_keep_python_json_types(self):
        result = self.decode(
            b'{"ok":true,"result":{"numbers":[1,1.5,0,1e-7]}}'
        )
        numbers = result["result"]["numbers"]
        self.assertIs(type(numbers[0]), int)
        self.assertEqual(numbers[0], 1)
        self.assertIs(type(numbers[1]), float)
        self.assertEqual(numbers[1], 1.5)
        self.assertIs(type(numbers[2]), int)
        self.assertEqual(numbers[2], 0)
        self.assertIs(type(numbers[3]), float)
        self.assertEqual(numbers[3], 1e-7)

    def test_refuses_non_profile_numbers_and_non_json_constants(self):
        for raw in (
            b'{"ok":true,"result":{"n":-0}}',
            b'{"ok":true,"result":{"n":-0.0}}',
            b'{"ok":true,"result":{"n":1e21}}',
            b'{"ok":true,"result":{"n":NaN}}',
            b'{"ok":true,"result":{"n":Infinity}}',
            b'{"ok":true,"result":{"n":1,"n":2}}',
            b'{"ok":true,"result":{"n":1e999}}',
            b'{"ok":true,"result":{"n":9007199254740992}}',
        ):
            with self.subTest(raw=raw), self.assertRaises(GenerationError) as caught:
                self.decode(raw)
            self.assertEqual(caught.exception.code, "GENERATION_FAILED")

    def test_refuses_excessive_depth_and_value_count(self):
        too_deep = b'{"ok":true,"result":' + b"[" * 258 + b"0" + b"]" * 258 + b"}"
        with self.assertRaises(GenerationError):
            self.decode(too_deep)
        too_many = b'{"ok":true,"result":[' + b"0," * 1_000_001 + b"0]}"
        with self.assertRaises(GenerationError):
            self.decode(too_many)

    def test_preserves_utf8_and_escaped_surrogate_strings(self):
        result = self.decode(b'{"ok":true,"result":{"text":"caf\xc3\xa9\\ud800"}}')
        self.assertEqual(result["result"]["text"], "caf\u00e9\ud800")

    def test_enforces_response_byte_limit(self):
        with (
            patch("umf_codegen._native._MAX_RESPONSE", 10),
            self.assertRaises(GenerationError) as caught,
        ):
            self.decode(b'{"ok":true,"result":{}}')
        self.assertEqual(caught.exception.code, "GENERATION_CAPACITY")

    def test_checks_deadline_after_parse_and_during_traversal(self):
        with self.assertRaises(GenerationError) as caught:
            _decode_cli_json_response(b'{"ok":true,"result":{}}', time.monotonic() - 1)
        self.assertEqual(caught.exception.code, "GENERATION_TIMEOUT")


if __name__ == "__main__":
    unittest.main()
