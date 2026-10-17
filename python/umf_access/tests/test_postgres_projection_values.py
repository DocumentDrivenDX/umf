"""Closed native projection decoders; managed/native acceptance is separate."""
import math
import unittest

from umf_access.pages import ReadObligationUnmet
from umf_access.postgres_read import _output_value
from umf_access.postgres_search import SearchError, _decode


class PostgresProjectionValues(unittest.TestCase):
    def test_native_float32_text_is_reconstructed_without_rounding_inputs(self):
        output = {"carrier": "vector", "nullable": False,
                  "decoder": {"profile": "pgvector-text-float32/0.8.6", "dimensions": 3}}
        decoded = _output_value("[0.1,-0.0,1]", output)
        self.assertEqual(decoded, (0.10000000149011612, -0.0, 1.0))
        self.assertEqual(math.copysign(1, decoded[1]), -1)
        self.assertEqual(_decode("[0.1,-0.0,1]", output), decoded)
        for profile in ("pgvector-text-float32/0.8.6", "pgvector-text-float32/0.8.7"):
            self.assertEqual(_output_value("[1]", {**output, "decoder": {"profile": profile, "dimensions": 1}}), (1.0,))
        for payload in ("[1,true,0]", "[1,0]", "[NaN,0,0]", "[1e99,0,0]", "{\"x\":1}", (1.0, 0.0, 0.0)):
            with self.subTest(payload=payload), self.assertRaises(ReadObligationUnmet):
                _output_value(payload, output)
            with self.assertRaises(SearchError):
                _decode(payload, output)
        for decoder in ({"profile": "pgvector-text-float32/0.9", "dimensions": 3},
                        {"profile": "pgvector-text-float32/0.8.6", "dimensions": True}):
            with self.assertRaises(ReadObligationUnmet):
                _output_value("[1,0,0]", {**output, "decoder": decoder})

    def test_binary_buffers_are_owned_and_wrong_profiles_never_coerce(self):
        output = {"carrier": "binary", "nullable": False, "decoder": {"profile": "pg-bytea/0.1"}}
        original = bytearray(b"\x00\xff")
        decoded = _output_value(original, output)
        original[0] = 1
        self.assertEqual(decoded, b"\x00\xff")
        self.assertEqual(_output_value(memoryview(b"\x00\xff"), output), decoded)
        self.assertIsNone(_output_value(None, {**output, "nullable": True}))
        for value in ("AA==", 1, None):
            with self.subTest(value=value), self.assertRaises(ReadObligationUnmet):
                _output_value(value, output)
        with self.assertRaises(ReadObligationUnmet):
            _output_value(b"x", {**output, "decoder": {"profile": "unknown"}})


if __name__ == "__main__":
    unittest.main()
