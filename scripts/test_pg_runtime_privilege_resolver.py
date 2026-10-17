import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pg_runtime_privilege_resolver import NodeError, analyze, node_tree, substitute


class NativeNodes(unittest.TestCase):
    def test_pg18_row_lock_clause_retained_and_closed(self):
        text = "{ROWMARKCLAUSE :rti 1 :strength 4 :waitPolicy 0 :pushedDown false}"
        self.assertEqual(
            analyze(text)["rowLocks"],
            [{"rti": 1, "strength": 4, "waitPolicy": 0, "pushedDown": False}],
        )
        for wrong in [
            text.replace(":rti 1", ":rti 0"),
            text.replace(":strength 4", ":strength 5"),
            text.replace(":waitPolicy 0", ":waitPolicy 3"),
            text.replace(":pushedDown false", ":pushedDown 0"),
            text.replace("}", " :unknown 1}"),
        ]:
            with self.subTest(wrong=wrong), self.assertRaises(NodeError):
                analyze(wrong)

    def test_pg18_attribute_bitmap_contract(self):
        import re
        from pathlib import Path

        header = Path(
            "/opt/homebrew/opt/postgresql@18/include/postgresql/server/access/sysattr.h"
        ).read_text()
        offset = int(
            re.search(
                r"#define FirstLowInvalidHeapAttributeNumber\s+\((-?\d+)\)", header
            ).group(1)
        )
        self.assertEqual(offset, -7)
        self.assertEqual({bit + offset for bit in [7, 8, 9]}, {0, 1, 2})

    def test_system_attribute_permission_refuses(self):
        from unittest.mock import patch

        from pg_runtime_privilege_resolver import relation_inventory

        probe = {
            "statement": {"id": "closed-control"},
            "analysis": {
                "relationPermissions": [
                    {
                        "relid": 1259,
                        "requiredPerms": 2,
                        "checkAsUser": 0,
                        "selectedCols": ["b", 6],
                    }
                ]
            },
        }
        relation = {
            "oid": 1259,
            "schema": "pg_catalog",
            "relname": "pg_class",
            "relkind": "r",
            "relowner": 10,
            "reloptions": None,
        }
        column = {"attnum": 1, "attname": "oid", "atttypid": 26, "attacl": None}
        with (
            patch(
                "pg_runtime_privilege_resolver.rows", side_effect=[[relation], [column]]
            ),
            self.assertRaisesRegex(ValueError, "unreviewed native system column ACL"),
        ):
            relation_inventory(None, [probe], "probe_schema", -7)

    def test_calls_casts_sort_intrinsic_and_datum(self):
        tree = "({QUERY :targetList ({TARGETENTRY :expr {FUNCEXPR :funcid 2078 :funcresulttype 25 :funcformat 0 :args ({CONST :consttype 25 :constvalue 4 [ 1 0 0 0 ]})}}) :sortClause ({SORTGROUPCLAUSE :eqop 96 :sortop 97}) :qual {BOOLEXPR :boolop and :args ({OPEXPR :opno 96 :opfuncid 65 :opresulttype 16} {COERCEVIAIO :arg {VAR :vartype 3802} :resulttype 25})}})"
        result = analyze(tree)
        self.assertEqual(result["functionOids"], [65, 2078])
        self.assertEqual(result["operatorOids"], [96, 97])
        self.assertEqual(result["sortOperatorOids"], [97])
        self.assertEqual(result["casts"][0]["sourceTypeOid"], 3802)

    def test_unknown_execution_refuses(self):
        with self.assertRaises(NodeError):
            analyze("({FUTURECALL :funcid 999})")

    def test_duplicate_truncated_trailing_refuse(self):
        for text in [
            "{VAR :vartype 25 :vartype 26}",
            "({VAR :vartype 25}",
            "{VAR :vartype 25} unexpected",
        ]:
            with self.subTest(text=text), self.assertRaises(NodeError):
                node_tree(text)

    def test_native_escaped_atoms_and_parameter_inventory(self):
        self.assertEqual(
            node_tree("{ALIAS :aliasname has\\ space :colnames <>}")["fields"][
                "aliasname"
            ],
            "has space",
        )
        self.assertEqual(
            substitute("SELECT %s, 'it''s literal'", ["NULL::pg_catalog.int2"]),
            "SELECT NULL::pg_catalog.int2, 'it''s literal'",
        )
        for query, values in [
            ("SELECT '%s'", ["NULL"]),
            ("SELECT %s", []),
            ("SELECT 1", ["NULL"]),
        ]:
            with self.subTest(query=query), self.assertRaises(ValueError):
                substitute(query, values)


if __name__ == "__main__":
    unittest.main(verbosity=2)
