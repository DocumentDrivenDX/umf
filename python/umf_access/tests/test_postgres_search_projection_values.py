"""Search consumes the same original PG native projection decoder as reads."""

import struct
import unittest
from decimal import Decimal

from umf_access.postgres_search import SearchError, _decode


class PostgresSearchProjectionValues(unittest.TestCase):
    def test_original_bytea_and_vector_profiles(self):
        binary = {"carrier": "binary", "nullable": False,
                  "decoder": {"profile": "pg-bytea/0.1"}}
        for raw in (b"\x00\xff", bytearray(b"\x00\xff"), memoryview(b"\x00\xff")):
            self.assertEqual(_decode(raw, binary), b"\x00\xff")
        for raw in ("00ff", [0, 255], None):
            with self.assertRaises(SearchError):
                _decode(raw, binary)
        with self.assertRaises(SearchError):
            _decode(b"raw", {**binary, "decoder": {"profile": "unqualified"}})
        for version in ("0.8.6", "0.8.7"):
            vector = {"carrier": "vector", "nullable": False,
                      "decoder": {"profile": "pgvector-text-float32/" + version,
                                  "dimensions": 2}}
            expected = tuple(struct.unpack("!f", struct.pack("!f", value))[0]
                             for value in (0.1, -0.2))
            self.assertEqual(_decode("[0.1,-0.2]", vector), expected)
            for raw in ("[0.1]", "[0.1,NaN]", [0.1, -0.2], None):
                with self.assertRaises(SearchError):
                    _decode(raw, vector)
        self.assertIsNone(_decode(None, {**binary, "nullable": True}))

    def test_original_exact_integer_numeric_and_scalar_domains(self):
        integer = {"carrier": "integer", "nullable": False}
        self.assertEqual(_decode(Decimal(18446744073709551615), integer), 18446744073709551615)
        for raw in (True, "123", 123.0, Decimal("1.1"), Decimal("NaN")):
            with self.assertRaises(SearchError):
                _decode(raw, integer)
        exact = Decimal("-0.0000000000")
        self.assertTrue(_decode(exact, {"carrier": "decimal", "nullable": False}).is_signed())
        for raw in (1, "1", Decimal("Infinity")):
            with self.assertRaises(SearchError):
                _decode(raw, {"carrier": "decimal", "nullable": False})


if __name__ == "__main__":
    unittest.main()
