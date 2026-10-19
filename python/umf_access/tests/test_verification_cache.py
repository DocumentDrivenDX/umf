# SPDX-License-Identifier: MIT OR Apache-2.0
"""Cache reuse never substitutes for fresh native identity and actor checks."""

import unittest
from datetime import timedelta
from unittest.mock import patch

from umf_access import postgres_read as read
from umf_access.pages import ReadObligationUnmet
from umf_access.verification import (
    PostgresVerificationCache,
    configure_postgres_verification_cache,
)


class VerificationCacheTests(unittest.TestCase):
    def test_expiry_and_bounded_lru_only_invalidate_reuse(self):
        cache = PostgresVerificationCache(max_entries=2, lifetime=timedelta(seconds=5))
        with patch("umf_access.verification.time.monotonic", return_value=1):
            cache.remember("a", "one")
            cache.remember("b", "two")
            self.assertTrue(cache.matches("a", "one"))
            cache.remember("c", "three")
            self.assertFalse(cache.matches("b", "two"))
        with patch("umf_access.verification.time.monotonic", return_value=6):
            self.assertFalse(cache.matches("a", "one"))
        cache.remember("x", "old")
        self.assertFalse(cache.matches("x", "new"))
        self.assertFalse(cache.matches("x", "old"))
        cache.clear()

    def admission(self, *, fingerprint="shape", column_type="int8", bypass=False, context="native-system-db-schema"):
        binding = {"tables": [{"native": "docs", "columns": [{"logical": "id", "native": "id", "carrier": "integer", "nullable": False}], "key": ["id"]}]}
        program = read.native_read_admission(binding, "app", ("LOCK ORIGINAL",), cache_context=context)
        answer, sql, calls = None, None, []
        while True:
            try:
                step = program.send(answer)
            except StopIteration:
                return calls
            if step[0] == "execute":
                sql = step[1]
                calls.append(sql)
                answer = None
            elif step[0] == "one":
                answer = ("reader", "reader", bypass, False) if sql == read._ROLE else (100, "r", False, False, False) if sql == read._TABLE else (100,)
            elif step[0] == "many":
                answer = [(100, "app", "docs", fingerprint)] if sql == read._SHAPE else [("id", "pg_catalog", column_type, True)] if sql == read._COLUMNS else [(["id"],)]
            else:
                self.fail(f"unexpected native admission step {step}")

    def test_hit_skips_only_shape_validation_after_fresh_native_observation(self):
        configure_postgres_verification_cache()
        first = self.admission()
        second = self.admission()
        self.assertIn(read._COLUMNS, first)
        self.assertIn(read._KEYS, first)
        self.assertNotIn(read._COLUMNS, second)
        self.assertNotIn(read._KEYS, second)
        for required in (read._ROLE, "LOCK ORIGINAL", read._TABLE, read._SHAPE):
            self.assertIn(required, second)
        self.assertIn(read._COLUMNS, self.admission(context="different-native-store"))
        with self.assertRaises(ReadObligationUnmet):
            self.admission(bypass=True)
        with self.assertRaises(ReadObligationUnmet):
            self.admission(fingerprint="native-DDL-change", column_type="numeric")
        # Without explicit native store/resolution proof every use refreshes.
        self.assertIn(read._COLUMNS, self.admission(context=None))

    def test_partial_or_foreign_native_fingerprint_inventory_refuses(self):
        for rows in ([], [(100, "other", "docs", "shape")], [(101, "app", "docs", "shape")],
                     [(100, "app", "docs", "")], [(100, "app", "docs", "shape")] * 2):
            program = read._shape_fingerprint([("docs", 100)], "app")
            self.assertEqual(next(program)[0], "execute")
            self.assertEqual(program.send(None), ("many", 2))
            with self.subTest(rows=rows), self.assertRaises(ReadObligationUnmet):
                program.send(rows)


if __name__ == "__main__":
    unittest.main()
