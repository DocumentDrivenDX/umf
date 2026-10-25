# SPDX-License-Identifier: MIT OR Apache-2.0
"""Check the exact pre-Weft refusal boundary for the frozen capture cohort."""

import hashlib
import json
import unittest
from pathlib import Path


FIXTURES = Path(__file__).parent / "fixtures/rust-catalog-capture"


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


class CapturedLogicalRenderPacketTests(unittest.TestCase):
    def test_capture_packet_pin_and_exact_refusal_order(self):
        source = FIXTURES / "declarations-v1.json"
        packet = json.loads((FIXTURES / "logical-render-v1.json").read_text(encoding="utf-8"))
        self.assertEqual(packet["input"]["sha256"], hashlib.sha256(source.read_bytes()).hexdigest())
        self.assertEqual(
            [(case["declaration"], case["presence"]["$tuple"]) for case in packet["cases"]],
            [("direct", []), ("filtered", []), ("optional", []), ("optional", ["value"])],
        )
        for case in packet["cases"]:
            self.assertEqual(case["outcome"], "refused")
            self.assertEqual(case["code"], "CAPTURE_UNSUPPORTED")
            self.assertEqual(
                case["message"],
                "CAPTURE_UNSUPPORTED: Record requires authored namespace and logical name",
            )
            self.assertIsNone(case["logicalRequest"])

    def test_capture_does_not_author_logical_record_or_field_names(self):
        source = json.loads((FIXTURES / "declarations-v1.json").read_text(encoding="utf-8"))
        records = [
            value["fields"]
            for value in walk(source)
            if value.get("$type") == "umf_access.dsl._nodes.RecordRef"
        ]
        fields = [
            value["fields"]
            for value in walk(source)
            if value.get("$type") == "umf_access.dsl._nodes.FieldRef"
        ]
        self.assertTrue(records)
        self.assertTrue(fields)
        self.assertTrue(all(record["logical_namespace"] is None and record["logical_name"] is None for record in records))
        self.assertTrue(all(field["logical_name"] is None for field in fields))


if __name__ == "__main__":
    unittest.main()
