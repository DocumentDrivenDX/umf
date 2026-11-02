# SPDX-License-Identifier: MIT OR Apache-2.0
"""Keep all published Python entrypoints and bridge operation names stable."""
import unittest
from unittest.mock import call, patch

from umf_codegen import (
    compile_table_deployment,
    compile_table_migration,
    discover_table_migration_changes,
    generate_python_client,
    normalize_row_scope,
    verify_table_deployment,
    verify_table_migration,
)


class PublicOperations(unittest.TestCase):
    @patch("umf_codegen.execute", return_value={"changes": []})
    def test_all_seven_operations_keep_request_shapes(self, execute):
        bundle = {"bundle": True}
        plan = {"plan": True}
        previous = {"previous": True}
        next_bundle = {"next": True}
        source = "{}"
        config = {"module": "m", "schema": "s", "ownerRole": "o",
                  "personRole": "p", "batchRole": "b", "groupRoles": {}}

        generate_python_client(source, package="client", timeout_seconds=3)
        compile_table_deployment(source, configuration=config, timeout_seconds=4)
        verify_table_deployment(bundle, timeout_seconds=5)
        compile_table_migration(migration_id="001", predecessor=None, previous_bundle=None,
                                next_bundle=next_bundle, timeout_seconds=6)
        verify_table_migration(plan, timeout_seconds=7)
        self.assertEqual(discover_table_migration_changes(previous, next_bundle, timeout_seconds=8), [])
        normalize_row_scope({"source": True}, context={"tableId": "t"}, timeout_seconds=9)

        self.assertEqual(execute.call_args_list, [
            call({"text": source, "package": "client", "format": "json"}, 3),
            call({"text": source, "format": "json", "configuration": config}, 4,
                 operation="deployment"),
            call({"bundle": bundle}, 5, operation="verify_deployment"),
            call({"id": "001", "predecessor": None, "previous": None, "next": next_bundle}, 6,
                 operation="migration"),
            call({"plan": plan}, 7, operation="verify_migration"),
            call({"previous": previous, "next": next_bundle}, 8, operation="discover_changes"),
            call({"input": {"source": True}, "context": {"tableId": "t"}}, 9,
                 operation="row_scope"),
        ])


if __name__ == "__main__":
    unittest.main()
