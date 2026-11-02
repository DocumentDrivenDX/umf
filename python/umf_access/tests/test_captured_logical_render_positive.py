# SPDX-License-Identifier: MIT OR Apache-2.0
"""Assert frozen positive pre-Weft logical-render observations and their inputs."""

import hashlib
import json
import unittest
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures/rust-catalog-capture"
NEGATIVE_SHA256 = "af737cbfdc02a6c3e80dcbc951ab412e84581dea67f03e1eb966b6a59baffc0e"


class CapturedLogicalRenderPositiveTests(unittest.TestCase):
    def test_positive_texts_refusal_and_preserved_negative_packet(self):
        negative = FIXTURES / "logical-render-v1.json"
        self.assertEqual(hashlib.sha256(negative.read_bytes()).hexdigest(), NEGATIVE_SHA256)
        packet = json.loads((FIXTURES / "logical-render-positive-v1.json").read_text(encoding="utf-8"))
        self.assertEqual(packet["negativePredecessor"]["sha256"], NEGATIVE_SHA256)
        declarations = {item["name"]: item for item in packet["declarations"]}
        self.assertEqual(list(declarations), ["direct", "filtered", "optional", "unsupported_result"])
        direct = declarations["direct"]
        self.assertEqual(direct["captureOutcome"], "captured")
        self.assertEqual(direct["variants"][0]["logicalRequest"],
            'SELECT "r".* FROM "com.example.billing"."Invoice" AS "r" LIMIT 4')
        filtered = declarations["filtered"]["variants"][0]
        self.assertEqual(filtered["logicalRequest"],
            'SELECT "r".* FROM "com.example.billing"."Invoice" AS "r" WHERE "r"."status" = :value LIMIT 4')
        optional = declarations["optional"]["variants"]
        self.assertEqual([case["presence"]["$tuple"] for case in optional], [[], ["value"]])
        self.assertEqual([case["logicalRequest"] for case in optional], [
            'SELECT "r".* FROM "com.example.billing"."Invoice" AS "r" LIMIT 4',
            'SELECT "r".* FROM "com.example.billing"."Invoice" AS "r" WHERE "r"."status" = :value LIMIT 4',
        ])
        refusal = declarations["unsupported_result"]
        self.assertEqual(refusal["captureOutcome"], "refused")
        self.assertEqual(refusal["captureCode"], "CAPTURE_UNSUPPORTED")
        self.assertEqual(refusal["captureMessage"], "CAPTURE_UNSUPPORTED: declaration must return a DSL terminal")


if __name__ == "__main__":
    unittest.main()
