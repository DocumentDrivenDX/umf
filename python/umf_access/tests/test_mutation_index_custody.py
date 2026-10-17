"""Mutation index proof custody codecs; test guards are not engine authority."""

import copy
import json
import unittest
from pathlib import Path

from umf_access.native_program import _mutation_index_custody
from umf_access.protocols import ActionRefused

ROOT = Path(__file__).resolve().parents[3]


def original_bulk():
    return json.loads((ROOT / "fixtures/access/term-configuration-custody/r20-bulk-terms-program.json").read_text())


def transport_action():
    action = copy.deepcopy(original_bulk()["actionTemplate"])
    action["version"] = "weft.native-action/0.2"
    guard = {"sql": "SELECT test_only_index_absence()", "dbapiSql": "SELECT test_only_index_absence()", "parameters": [], "dbapiParameterOrder": []}
    marker = {"version": "umf.pg-index-effects/0.1", "nativeCatalogBeforeAfter": True, "lockPosition": "before-first-snapshot", "lockSql": ['LOCK TABLE "orders" IN SHARE ROW EXCLUSIVE MODE NOWAIT'], "tables": [{"logicalTable": ["sales", "order"], "nativeTable": "orders", "allowedIndexes": [], "originalKeys": [["id"]], "nativeAdmission": guard}]}
    action["obligations"]["mutationIndexEffects"] = marker
    action["obligations"]["nativeProjection"]["columns"].append({"nativeAdmission": copy.deepcopy(guard)})
    return action


class MutationIndexCustodyTests(unittest.TestCase):
    def test_actual_old_original_has_no_proof(self):
        for original in (original_bulk(), original_bulk()["actionTemplate"]):
            with self.assertRaisesRegex(ActionRefused, "NATIVE_MUTATION_INDEX_EFFECTS_REQUIRED"):
                _mutation_index_custody(original)

    def test_complete_original_inventory_and_executed_guard_required(self):
        original = transport_action()
        _mutation_index_custody(original)
        for mutate in (
            lambda p: p["obligations"].pop("mutationIndexEffects"),
            lambda p: p.update(version="weft.native-action/0.1"),
            lambda p: p["obligations"]["mutationIndexEffects"].update(lockSql=[]),
            lambda p: p["obligations"]["mutationIndexEffects"].update(lockPosition="after-host-admission"),
            lambda p: p["obligations"]["mutationIndexEffects"]["tables"][0].pop("originalKeys"),
            lambda p: p["obligations"]["mutationIndexEffects"]["tables"][0].update(originalKeys=[]),
            lambda p: p["obligations"]["mutationIndexEffects"]["tables"][0].update(originalKeys=[["id", "id"]]),
            lambda p: p["obligations"]["mutationIndexEffects"]["tables"][0].update(originalKeys=[["id"], ["id"]]),
            lambda p: p["obligations"]["mutationIndexEffects"].update(nativeCatalogBeforeAfter=1),
            lambda p: p["obligations"]["nativeProjection"]["columns"].pop(),
            lambda p: p["obligations"]["mutationIndexEffects"]["tables"][0].update(allowedIndexes=["unaccounted"]),
            lambda p: p["obligations"]["mutationIndexEffects"]["tables"][0].update(logicalTable=["wrong", "table"]),
            lambda p: p["fields"].update(extra={"table": ["other", "record"]}),
            lambda p: p["obligations"]["mutationIndexEffects"]["tables"].append({**copy.deepcopy(p["obligations"]["mutationIndexEffects"]["tables"][0]), "nativeTable": "duplicate-logical"}),
            lambda p: p["obligations"]["mutationIndexEffects"]["tables"][0]["nativeAdmission"].update(parameters=[{"name": "s", "carrier": "string", "source": {"appSchema": True}}]),
        ):
            bad = copy.deepcopy(original)
            mutate(bad)
            with self.subTest(bad=bad), self.assertRaises(ActionRefused):
                _mutation_index_custody(bad)

    def test_bulk_inherits_whole_original_action_proof(self):
        action = transport_action()
        bulk = original_bulk()
        bulk["version"] = "weft.native-bulk/0.2"
        bulk["actionTemplate"] = action
        bulk["obligations"]["mutationIndexEffects"] = copy.deepcopy(action["obligations"]["mutationIndexEffects"])
        bulk["obligations"]["nativeProjection"]["columns"].append(copy.deepcopy(action["obligations"]["nativeProjection"]["columns"][-1]))
        _mutation_index_custody(bulk)
        bulk["actionTemplate"]["obligations"]["mutationIndexEffects"]["tables"][0]["nativeTable"] = "changed"
        with self.assertRaises(ActionRefused):
            _mutation_index_custody(bulk)

    def test_original_effect_allowlist_cannot_be_dropped_or_invented(self):
        action = transport_action()
        action["obligations"]["textSearchEffects"] = {"version": "umf.pg-ts-effects/0.1", "nativeCatalogBeforeAfter": True, "indexes": [{"logicalTable": ["sales", "order"], "nativeBinding": {"native": "declared_terms"}}]}
        with self.assertRaises(ActionRefused):
            _mutation_index_custody(action)
        action["obligations"]["mutationIndexEffects"]["tables"][0]["allowedIndexes"] = ["declared_terms"]
        _mutation_index_custody(action)
        action["obligations"]["textSearchEffects"]["indexes"][0]["logicalTable"] = ["extra", "outside"]
        with self.assertRaises(ActionRefused):
            _mutation_index_custody(action)


if __name__ == "__main__":
    unittest.main()
