"""Scoped native evidence cannot become a target-wide grant or qualification."""

from __future__ import annotations

import copy
import hashlib
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from umf_access.build import pg_privileges
from umf_access.build.privileges import privilege_report


def target(kind="postgresql", versions=None):
    return {
        "id": "pg",
        "kind": kind,
        "backendId": "weft-postgresql",
        "backendVersion": "raw-read/0.1",
        "targetProfile": "weft.raw-read/0.1",
        "platform": [{"name": "postgresql", "versions": versions or ["180006"]}],
    }


def entry(kind="query", version="weft.raw-read/0.1"):
    return {
        "name": "rows",
        "kind": kind,
        "targetId": "pg",
        "artifact": {
            "version": version,
            "target": "postgresql18",
            "binding": {"schemaBinding": "qualified"},
            "privilegeInventory": {
                "version": "weft.native-privileges/0.1",
                "complete": True,
                "unresolved": [],
                "functions": [{"name": "original-only"}],
            },
        },
    }


def report(t=None, e=None):
    return privilege_report([t or target()], [e or entry()])["targets"][0]


class PostgresPrivilegeAdvisoryTests(unittest.TestCase):
    def test_fenced_response_requires_closed_validator_without_qualification_transfer(self):
        candidate = entry(version="weft.raw-read/0.2")
        with patch.object(pg_privileges, "catalog_fence", return_value={"test": "codec-only"}) as validate:
            advisory = pg_privileges.postgres_runtime_advisory(target(), [candidate])
        validate.assert_called_once_with(candidate["artifact"])
        self.assertEqual(advisory["matchingEntryNames"], ["rows"])
        self.assertFalse(advisory["inventoryComplete"])
        self.assertEqual(advisory["qualification"]["leastPrivilege"], "UNQUALIFIED")
        with patch.object(pg_privileges, "catalog_fence", return_value=None):
            advisory = pg_privileges.postgres_runtime_advisory(target(), [candidate])
        self.assertEqual(advisory["matchingEntryNames"], [])
        self.assertEqual(advisory["entriesOutsideRuntimeSlice"], ["rows"])
        with self.assertRaisesRegex(ValueError, "closed fence failure"), patch.object(
            pg_privileges, "catalog_fence", side_effect=ValueError("closed fence failure")
        ):
            pg_privileges.postgres_runtime_advisory(target(), [candidate])

    def test_current_runtime_reference_cannot_qualify_current_target_or_other_operations(
        self,
    ):
        result = report()
        reference = result["runtimeAdvisory"]["testedReferences"][0]
        root = Path(__file__).resolve().parents[3]
        inventory = root / reference["packet"] / "inventory.json"
        self.assertEqual(
            hashlib.sha256(inventory.read_bytes()).hexdigest(),
            reference["packetInventorySha256"],
        )
        self.assertEqual(
            reference["sdkSourceCommit"], "7b206ef3b2720500c8409b17915629e4aac11448"
        )
        self.assertEqual(
            [e["name"] for e in reference["selectedEntries"]], ["plain", "pages"]
        )
        self.assertEqual(reference["observedNecessaryFunctions"], 27)
        self.assertFalse(reference["currentTargetQualified"])
        self.assertFalse(reference["qualificationTransfer"])
        self.assertFalse(reference["nativeAuthority"])
        self.assertFalse(reference["inventoryComplete"])
        self.assertTrue(
            {"actions", "bulk commands", "search"}.issubset(
                reference["unselectedOperations"]
            )
        )
        self.assertFalse(result["inventoryComplete"])
        self.assertEqual(result["qualification"]["leastPrivilege"], "UNQUALIFIED")
        reference["selectedEntries"].clear()
        self.assertEqual(
            len(report()["runtimeAdvisory"]["testedReferences"][0]["selectedEntries"]),
            2,
        )

    def historical_sql_snapshot(self):
        # Unit fixture for the unchanged archived native cohort, not current SQL
        # qualification. The real current snapshot is checked separately below.
        snapshot = pg_privileges._source_snapshot()
        snapshot["fixedSql"] = copy.deepcopy(pg_privileges._EVIDENCE["fixedSql"])
        return snapshot

    def test_changed_current_sql_suppresses_legacy_reference_grants(self):
        data = report()["runtimeAdvisory"]
        self.assertNotEqual(
            {k: v["sha256"] for k, v in data["sourceObservation"]["fixedSql"].items()},
            {k: v["sha256"] for k, v in pg_privileges._EVIDENCE["fixedSql"].items()},
        )
        self.assertFalse(data["fixedSqlHashesMatch"])
        self.assertEqual(data["referenceGrantStatements"], [])
        self.assertFalse(data["nativeTestedSourceMatches"])
        self.assertFalse(data["inventoryComplete"])

    def test_historical_sql_fixture_emits_only_scoped_runtime_reference_grants(self):
        with patch.object(pg_privileges, "_source_snapshot", return_value=self.historical_sql_snapshot()):
            result = report()
        data = result["runtimeAdvisory"]
        self.assertTrue(data["fixedSqlHashesMatch"])
        self.assertEqual(len(data["runtimeFunctions"]), 23)
        self.assertEqual(len(data["runtimeRelations"]), 14)
        self.assertEqual(sum(r["wholeRow"] for r in data["runtimeRelations"]), 8)
        self.assertEqual(len(data["referenceGrantStatements"]), 37)
        self.assertTrue(
            all(
                'TO "<principal>";' in statement
                for statement in data["referenceGrantStatements"]
            )
        )
        self.assertFalse(
            any(" ALL " in statement for statement in data["referenceGrantStatements"])
        )
        self.assertNotIn("pg_authid", {r["relation"] for r in data["runtimeRelations"]})
        self.assertFalse(result["inventoryComplete"])
        self.assertFalse(data["qualification"]["sufficiencyClaim"])
        self.assertEqual(result["qualification"]["leastPrivilege"], "UNQUALIFIED")

    def test_unchanged_sql_does_not_qualify_changed_runtime_dependency(self):
        snapshot = self.historical_sql_snapshot()
        snapshot["sha256"] = pg_privileges._EVIDENCE["evidence"][
            "testedRuntimeSourceSha256"
        ]
        snapshot["nativePayloads"] = copy.deepcopy(
            pg_privileges._EVIDENCE["nativeSdkSourceFiles"]
        )
        with patch.object(pg_privileges, "_source_snapshot", return_value=snapshot):
            self.assertTrue(report()["runtimeAdvisory"]["nativeTestedSourceMatches"])
        snapshot["nativePayloads"]["umf_access/verification.py"] = "0" * 64
        with patch.object(pg_privileges, "_source_snapshot", return_value=snapshot):
            data = report()["runtimeAdvisory"]
        self.assertTrue(data["fixedSqlHashesMatch"])
        self.assertFalse(data["nativeTestedSourceMatches"])

    def test_shipped_signatures_match_exact_native_provenance(self):
        root = Path(__file__).resolve().parents[3]
        data = report()["runtimeAdvisory"]
        packet = root / data["evidence"]["packet"]
        self.assertEqual(
            hashlib.sha256((packet / "inventory.json").read_bytes()).hexdigest(),
            data["evidence"]["inventorySha256"],
        )
        native = json.loads((packet / "runtime-descriptor.json").read_text())

        def signature(f):
            return (
                f["schema"],
                f["name"],
                tuple((t["schema"], t["name"]) for t in f["arguments"]),
                (f["result"]["schema"], f["result"]["name"]),
            )

        self.assertEqual(
            {signature(f) for f in data["runtimeFunctions"]},
            {signature(f["function"]) for f in native["runtimeRequiredFunctions"]},
        )
        self.assertEqual(
            {
                (r["schema"], r["relation"], tuple(r["columns"]), r["wholeRow"])
                for r in data["runtimeRelations"]
            },
            {
                (
                    r["schema"],
                    r["relname"],
                    tuple(c["attname"] for c in r["columns"]),
                    r["wholeRow"],
                )
                for r in native["runtimeMetadataSelect"]
            },
        )

    def test_selected_fixture_compiler_functions_stay_separate_from_owner(self):
        original = entry()
        result = report(e=original)
        data = result["runtimeAdvisory"]
        self.assertEqual(
            result["entries"][0]["ownerInventory"],
            original["artifact"]["privilegeInventory"],
        )
        self.assertEqual(len(data["selectedFixtureOwnerFunctions"]), 4)
        self.assertNotIn("text_gt", {f["name"] for f in data["runtimeFunctions"]})
        self.assertNotIn("booleq", {f["name"] for f in data["runtimeFunctions"]})
        self.assertFalse(
            any('"text_gt"' in sql for sql in data["referenceGrantStatements"])
        )
        self.assertFalse(result["inventoryComplete"])

    def test_sql_drift_or_unavailable_source_suppresses_reference_grants(self):
        changed = pg_privileges._source_snapshot()
        changed["fixedSql"]["_ROLE"]["sha256"] = "0" * 64
        for source in [changed, {"available": False, "reason": "OSError"}]:
            with (
                self.subTest(source=source),
                patch.object(pg_privileges, "_source_snapshot", return_value=source),
            ):
                data = report()["runtimeAdvisory"]
                self.assertFalse(data["fixedSqlHashesMatch"])
                self.assertEqual(data["referenceGrantStatements"], [])
                self.assertFalse(data["inventoryComplete"])

    def test_same_sql_does_not_qualify_changed_control_flow_source(self):
        changed = self.historical_sql_snapshot()
        changed["sha256"] = "1" * 64
        with patch.object(pg_privileges, "_source_snapshot", return_value=changed):
            data = report()["runtimeAdvisory"]
        self.assertTrue(data["fixedSqlHashesMatch"])
        self.assertFalse(data["nativeTestedSourceMatches"])
        self.assertIn("UNQUALIFIED_SOURCE_REVISION", data["currentSourceQualification"])
        self.assertFalse(data["qualification"]["sufficiencyClaim"])

    def test_other_versions_and_lakebase_never_receive_pg_reference_grants(self):
        for t in [
            target(versions=["180007"]),
            target(versions=["180006", "180007"]),
            target("lakebase"),
        ]:
            with self.subTest(target=t):
                data = report(t=t)["runtimeAdvisory"]
                self.assertFalse(data["declaredNativeProfileMatches"])
                self.assertEqual(data["referenceGrantStatements"], [])
                self.assertEqual(data["evidence"]["serverVersion"], 180006)

    def test_action_search_engine_and_unqualified_schema_entries_are_outside(self):
        cases = [
            entry("native-action"),
            entry(version="umf.search-catalog/0.1"),
            entry(version="umf.engine-catalog/0.1"),
            entry(),
        ]
        cases[-1]["artifact"]["binding"] = {}
        for e in cases:
            with self.subTest(entry=e):
                data = report(e=e)["runtimeAdvisory"]
                self.assertEqual(data["matchingEntryNames"], [])
                self.assertEqual(data["entriesOutsideRuntimeSlice"], ["rows"])
                self.assertEqual(data["referenceGrantStatements"], [])

    def test_no_input_or_cross_report_mutation(self):
        t = target()
        e = entry()
        original = copy.deepcopy((t, e))
        first = report(t=t, e=e)
        first["runtimeAdvisory"]["runtimeFunctions"].clear()
        first["runtimeAdvisory"]["inventoryComplete"] = True
        second = report(t=t, e=e)
        self.assertEqual((t, e), original)
        self.assertEqual(len(second["runtimeAdvisory"]["runtimeFunctions"]), 23)
        self.assertFalse(second["runtimeAdvisory"]["inventoryComplete"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
