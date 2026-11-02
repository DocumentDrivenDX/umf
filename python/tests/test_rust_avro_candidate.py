# SPDX-License-Identifier: MIT OR Apache-2.0
import json
import unittest
from pathlib import Path

from umf import rust_avro_candidate


def _fixture_case(index):
    path = Path(__file__).parents[2] / "fixtures" / "avro" / "candidate-edits.json"
    return json.loads(path.read_text(encoding="utf-8"))["cases"][index]


class TestAvroCandidate(unittest.TestCase):
    def test_candidate_edit_preserves_source_and_exact_large_integer_text(self):
        source = _fixture_case(3)["result"]["source"]
        report = rust_avro_candidate.propose_node_edit(
            source, "/fields/2/default", "9223372036854775807"
        )
        self.assertEqual(rust_avro_candidate.profile_version(), "umf-r5-avro-candidate/0.1.0")
        self.assertEqual(report["profile"], "umf-r5-avro-candidate/0.1.0")
        self.assertEqual(report["status"], "candidate")
        self.assertEqual(report["source"], source)
        self.assertIsNot(report["document"], source)
        self.assertEqual(report["edit"]["replacement"], {
            "kind": "number", "value": "9223372036854775807"
        })
        self.assertTrue(report["admission"]["source"]["valid"])
        self.assertTrue(report["admission"]["candidate"]["valid"])
        self.assertNotIn("validation", report)

    def test_dependency_edit_uses_artifact_id_and_keeps_inspection_separate(self):
        source = _fixture_case(4)["result"]["source"]
        report = rust_avro_candidate.propose_node_edit(
            source, "/scale", "3", dependency_id="money.avsc"
        )
        self.assertEqual(report["edit"]["dependencyId"], "money.avsc")
        self.assertFalse(report["nativeInspection"]["source"]["complete"])
        self.assertFalse(report["nativeInspection"]["candidate"]["complete"])

    def test_candidate_operation_preserves_refusal_order_and_host_controls(self):
        source = _fixture_case(3)["result"]["source"]
        with self.assertRaises(ValueError) as pointer_error:
            rust_avro_candidate.propose_node_edit(source, "not/a/pointer", "not-json")
        self.assertEqual(pointer_error.exception.code, "JSON_SCHEMA_POINTER")

        calls = []
        report = rust_avro_candidate.propose_node_edit(
            source, "/fields/2/default", "1", meter=calls.append
        )
        self.assertEqual(report["status"], "candidate")
        self.assertTrue(calls and all(type(amount) is int and amount >= 0 for amount in calls))

        with self.assertRaises(ValueError) as budget_error:
            rust_avro_candidate.propose_node_edit(
                source, "/fields/2/default", "1", max_work=0
            )
        self.assertEqual(budget_error.exception.code, "RESOURCE_LIMIT")

        with self.assertRaisesRegex(TypeError, "replacement_json must be an exact string"):
            rust_avro_candidate.propose_node_edit(source, "/fields/2/default", 1)
