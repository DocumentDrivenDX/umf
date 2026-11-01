# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed-cohort smoke witness for the public portable saga API."""

from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from umf import SagaRuntime, read_json_value, write_json_value


def _case(case_id: str) -> dict:
    root = Path(__file__).resolve().parents[2]
    corpus = json.loads((root / "fixtures/saga/portable.json").read_text(encoding="utf-8"))
    return next(case for case in corpus["cases"] if case["id"] == case_id)


class InstalledSagaLifecycle(unittest.TestCase):
    def test_author_declare_edit_exchange_and_assess(self) -> None:
        vector = _case("recipe-declaration")
        source = copy.deepcopy(vector["source"])
        original = copy.deepcopy(source)
        runtime = SagaRuntime()
        inspected = runtime.inspect_sagas(source)
        definition = copy.deepcopy(inspected["entries"][0]["definition"])
        module = inspected["entries"][0]["module"]
        definition["id"] = "python-installed-authored-saga"

        declared = runtime.declare_saga(source, module, definition)
        declared_before_edit = copy.deepcopy(declared)
        edit_request = {**definition, "name": "Installed Python lifecycle edit"}
        edit_request_before = copy.deepcopy(edit_request)
        self.assertEqual(source, original)
        identity = {"module": module, "saga": definition["id"]}
        self.assertIn(
            definition["id"],
            [item["id"] for item in declared["modules"][0]["extensions"]["umf.actions.saga"]["sagas"]],
        )
        edited = runtime.edit_saga(declared, identity, edit_request)
        self.assertEqual(declared, declared_before_edit)
        self.assertEqual(edit_request, edit_request_before)
        found = next(
            item
            for item in edited["modules"][0]["extensions"]["umf.actions.saga"]["sagas"]
            if item["id"] == identity["saga"]
        )
        self.assertEqual(found["name"], edit_request["name"])
        self.assertEqual(declared["modules"][0]["extensions"]["umf.actions.saga"]["sagas"][0]["id"], "approve-order")
        self.assertEqual(declared["modules"][0]["extensions"]["umf.actions.saga"]["sagas"][-1]["id"], identity["saga"])

        encoded = write_json_value(edited)
        exchanged = read_json_value(encoded)
        self.assertEqual(exchanged, edited)
        inspected_exchange = runtime.inspect_sagas(exchanged)
        edited_entry = next(
            item for item in inspected_exchange["entries"]
            if item["module"] == identity["module"] and item["definition"]["id"] == identity["saga"]
        )
        self.assertEqual(edited_entry["definition"]["name"], edit_request["name"])
        obligations = edited_entry["obligations"]
        capability_claims = [
            {"obligation": item["id"], "status": "supported", "evidence": ["urn:installed-test"]}
            for item in obligations
        ]
        assessment = runtime.assess_saga(
            exchanged,
            identity,
            {
                "id": "installed-python-lifecycle",
                "version": "1",
                "coreVersion": "0.10.0",
                "sagaVersion": "0.1.0",
                "coordination": "supported",
                "claims": capability_claims,
                "source": exchanged,
                "identity": identity,
            },
        )
        self.assertTrue(assessment["declarationCompatible"])
        self.assertFalse(assessment["executionVerified"])

    def test_unknown_recovery_meaning_refuses_edit(self) -> None:
        vector = _case("unknown-recovery")
        original = copy.deepcopy(vector["source"])
        runtime = SagaRuntime()
        inspection = runtime.inspect_sagas(vector["source"])
        identity = {
            "module": inspection["entries"][0]["module"],
            "saga": inspection["entries"][0]["definition"]["id"],
        }
        obligations = inspection["entries"][0]["obligations"]
        self.assertTrue(any(item["kind"] == "unknown" and item["status"] == "unchecked" for item in obligations))
        with self.assertRaises(Exception) as raised:
            runtime.edit_saga(
                vector["source"],
                identity,
                {**inspection["entries"][0]["definition"], "name": "Unsafe rewrite"},
            )
        self.assertEqual(getattr(raised.exception, "code", None), "SAGA_UNCHECKED")
        self.assertEqual(vector["source"], original)


if __name__ == "__main__":
    unittest.main()
