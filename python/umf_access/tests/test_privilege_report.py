# SPDX-License-Identifier: MIT OR Apache-2.0
"""Reports must retain owner evidence and distinguish incomplete native scope."""
import copy
import json
import unittest

from umf_access.build.privileges import privilege_report


class PrivilegeReportTests(unittest.TestCase):
    def test_each_target_uses_its_own_runtime_surface_without_claiming_sufficiency(self):
        targets = [{"id": kind, "kind": kind} for kind in (
            "postgresql", "lakebase", "spark-delta", "unity-catalog", "truss", "ashlar")]
        entries = [{"name": "read", "kind": "query", "targetId": target["id"],
                    "artifact": {"referencedTables": [{"native": "original"}]}} for target in targets]
        original = copy.deepcopy((targets, entries))
        result = privilege_report(targets, entries)
        for target in result["targets"]:
            self.assertFalse(target["inventoryComplete"])
            self.assertTrue(target["unresolved"])
            self.assertFalse(target["qualification"]["sufficiencyClaim"])
            self.assertEqual(target["qualification"]["leastPrivilege"], "UNQUALIFIED")
            self.assertEqual(target["entries"][0]["referencedTables"], [{"native": "original"}])
            if target["kind"] not in ("postgresql", "lakebase"):
                self.assertNotIn("pg_catalog", json.dumps(target["knownRuntimeSurface"]))
        self.assertEqual((targets, entries), original)

    def test_original_owner_inventory_and_unresolved_closure_are_preserved(self):
        owner = {"version": "weft.native-privileges/0.1", "complete": False,
                 "tables": [{"native": "rows", "columns": ["body"]}],
                 "unresolved": ["native-function-and-operator-overload-closure"]}
        result = privilege_report([{"id": "pg", "kind": "postgresql"}], [{
            "name": "read", "kind": "query", "targetId": "pg", "artifact": {"privilegeInventory": owner},
        }])["targets"][0]
        self.assertEqual(result["entries"][0]["ownerInventory"], owner)
        self.assertFalse(result["inventoryComplete"])
        self.assertEqual(result["grantProposal"]["status"], "OWNER_INVENTORY_REQUIRED")

    def test_complete_business_inventory_cannot_complete_runtime_checklist(self):
        owner = {"version": "weft.native-privileges/0.1", "complete": True,
                 "tables": [], "unresolved": []}
        result = privilege_report([{"id": "pg", "kind": "postgresql"}], [{
            "name": "read", "kind": "query", "targetId": "pg", "artifact": {"privilegeInventory": owner},
        }])["targets"][0]
        self.assertFalse(result["inventoryComplete"])
        self.assertEqual(len(result["unresolved"]), 1)
        self.assertIn("runtime metadata/control", result["unresolved"][0]["requirement"])


if __name__ == "__main__":
    unittest.main()
