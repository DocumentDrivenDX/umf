# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source-neutral context binds native store, relation and principal identity."""
import copy
import unittest

from umf_access.pages import ReadObligationUnmet
from umf_access.postgres_read import _resolution_context


class PostgresResolutionTests(unittest.TestCase):
    def rows(self, schema="tenant", system="123456", oid=100):
        return [["database", system, ["pg_catalog", schema], "docs", schema, oid, "reader", "reader", 5]]

    def test_store_schema_and_relation_partitions_are_native(self):
        first = _resolution_context(self.rows(), ["docs"], "tenant", "search-path", "database")
        original = copy.deepcopy(self.rows())
        self.assertNotEqual(first, _resolution_context(self.rows("other"), ["docs"], "other", "search-path", "database"))
        self.assertNotEqual(first, _resolution_context(self.rows(system="789"), ["docs"], "tenant", "search-path", "database"))
        self.assertNotEqual(first, _resolution_context(self.rows(oid=101), ["docs"], "tenant", "search-path", "database"))
        self.assertEqual(original, self.rows())

    def test_foreign_resolution_and_shadowing_refuse(self):
        changes = [(0, "foreign-database"), (1, "invented-label"),
                   (2, ["pg_temp_3", "pg_catalog", "tenant"]),
                   (3, "other-table"), (4, "foreign-schema"), (5, None), (6, ""), (8, None)]
        for index, value in changes:
            rows = self.rows()
            rows[0][index] = value
            with self.subTest(index=index), self.assertRaises(ReadObligationUnmet):
                _resolution_context(rows, ["docs"], "tenant", "search-path", "database")
        for rows in ([], [None], self.rows() * 2):
            with self.assertRaises(ReadObligationUnmet):
                _resolution_context(rows, ["docs"], "tenant", "search-path", "database")


if __name__ == "__main__":
    unittest.main()
