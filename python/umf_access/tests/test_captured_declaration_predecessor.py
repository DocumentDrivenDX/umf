# SPDX-License-Identifier: MIT OR Apache-2.0
"""The frozen capture DTO must retain semantically present null dataclass fields."""

import json
import unittest
from pathlib import Path


PACKET = Path(__file__).parent / "fixtures/rust-catalog-capture/declarations-v1.json"


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


class CapturedDeclarationPacketTests(unittest.TestCase):
    def test_null_alias_is_retained_as_a_field(self):
        packet = json.loads(PACKET.read_text(encoding="utf-8"))
        fields = [
            value["fields"]
            for value in walk(packet)
            if value.get("$type") == "umf_access.dsl._nodes.FieldRef"
        ]
        self.assertTrue(fields)
        self.assertTrue(all("alias" in field for field in fields))
        self.assertTrue(any(field["alias"] is None for field in fields))

    def test_python_container_types_are_tagged(self):
        packet = json.loads(PACKET.read_text(encoding="utf-8"))
        tagged = list(walk(packet))
        self.assertTrue(any("$tuple" in value for value in tagged))


if __name__ == "__main__":
    unittest.main()
