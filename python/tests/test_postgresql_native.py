# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public native PostgreSQL host baseline; requires native-postgresql build."""
import unittest

from umf import create_postgresql_sql_engine
from umf._rust import UmfCoreError


class NativePostgresqlBaseline(unittest.TestCase):
    def test_public_sql_edit_export_and_refusal(self):
        engine = create_postgresql_sql_engine()
        original = engine.import_sql("SELECT 1 AS value", "python-native-postgresql")
        edited = engine.edit_node(
            original,
            "/stmts/0/stmt/SelectStmt/targetList/0/ResTarget/val/A_Const/ival/ival",
            "2",
        )
        self.assertTrue(edited["validation"]["valid"])
        sql = engine.export_sql(edited["document"])
        self.assertIn("2", sql)
        self.assertTrue(engine.inspect(engine.import_sql(sql, "python-reparsed"))["valid"])
        self.assertEqual(engine.get_source(original), "SELECT 1 AS value")
        with self.assertRaises(UmfCoreError) as refused:
            engine.import_sql("SELECT FROM", "python-invalid")
        self.assertEqual(refused.exception.code, "POSTGRESQL_PARSE")


if __name__ == "__main__":
    unittest.main()
