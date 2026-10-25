# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import unittest

from umf_access.rust_catalog_render import profile_version, render_variant


ROOT = Path(__file__).resolve().parent
PACKET = ROOT / "fixtures/rust-catalog-capture/logical-render-positive-v1.json"
NEGATIVE_INPUT = ROOT / "fixtures/rust-catalog-capture/declarations-v1.json"
NEGATIVE_OBSERVATIONS = ROOT / "fixtures/rust-catalog-capture/logical-render-v1.json"
PACKET_PINS = {
    PACKET: "08ea0f4a70292be9b363c3d0c554708d212af3442673bf41be96c086bcc811e4",
    NEGATIVE_INPUT: "d4fe1110433c3b144ea8f29d391b72dd84c156b1f8984b4db414c1de6d5b933e",
    NEGATIVE_OBSERVATIONS: "af737cbfdc02a6c3e80dcbc951ab412e84581dea67f03e1eb966b6a59baffc0e",
}


def _variants():
    packet = json.loads(PACKET.read_text(encoding="utf-8"))
    for declaration in packet["declarations"]:
        if "capture" not in declaration:
            continue
        capture = declaration["capture"]["fields"]
        expected = declaration["variants"]
        for index, variant in enumerate(capture["variants"]["$tuple"]):
            yield declaration["name"], variant, expected[index]


class RustCatalogLogicalRenderTests(unittest.TestCase):
    def test_frozen_packet_pins(self):
        for path, expected in PACKET_PINS.items():
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), expected)

    def test_profile_and_frozen_positive_packet(self):
        self.assertEqual(profile_version(), "umf-access-logical-render/0.1.0")
        for name, variant, expected in _variants():
            with self.subTest(declaration=name, variant=expected["index"]):
                result = render_variant(
                    {"profile": "umf-access-logical-render/0.1.0", "variant": variant}
                )
                self.assertEqual(result["outcome"], expected["renderOutcome"])
                self.assertEqual(
                    result.get("logicalRequest"), expected["logicalRequest"]
                )

    def test_unknown_consumed_variant_member_refuses(self):
        _, variant, _ = next(_variants())
        changed = copy.deepcopy(variant)
        changed["fields"]["future"] = None
        result = render_variant(
            {"profile": "umf-access-logical-render/0.1.0", "variant": changed}
        )
        self.assertEqual(result["outcome"], "refused")
        self.assertEqual(result["code"], "CAPTURE_DTO_INVALID")

    def test_frozen_negative_predecessor_refusal_order_and_text(self):
        declarations = json.loads(NEGATIVE_INPUT.read_text(encoding="utf-8"))[
            "cases"
        ]
        expected = json.loads(NEGATIVE_OBSERVATIONS.read_text(encoding="utf-8"))[
            "cases"
        ]
        for case in expected:
            declaration = next(
                item for item in declarations if item["name"] == case["declaration"]
            )
            variant = declaration["value"]["fields"]["variants"]["$tuple"][
                case["variantIndex"]
            ]
            with self.subTest(declaration=case["declaration"], presence=case["presence"]):
                result = render_variant(
                    {
                        "profile": "umf-access-logical-render/0.1.0",
                        "variant": variant,
                    }
                )
                self.assertEqual(result["outcome"], "refused")
                self.assertEqual(result["code"], case["code"])
                self.assertEqual(
                    f"{result['code']}: {result['message']}", case["message"]
                )

    def test_join_refuses_without_binding_context(self):
        _, variant, _ = next(_variants())
        changed = copy.deepcopy(variant)
        record, steps = changed["fields"]["node"]["fields"]["args"]["$tuple"]
        steps["$tuple"].insert(
            0,
            {
                "$type": "umf_access.dsl._nodes.Node",
                "fields": {"args": {"$tuple": []}, "op": "join"},
            },
        )
        result = render_variant(
            {"profile": "umf-access-logical-render/0.1.0", "variant": changed}
        )
        self.assertEqual(result["outcome"], "refused")
        self.assertEqual(result["code"], "CAPTURE_UNSUPPORTED")
        self.assertEqual(
            result["message"], "join rendering requires declared build-time bindings"
        )

    def test_record_identity_refusal_precedes_unsupported_step(self):
        _, variant, _ = next(_variants())
        changed = copy.deepcopy(variant)
        record, steps = changed["fields"]["node"]["fields"]["args"]["$tuple"]
        record["fields"]["logical_name"] = ""
        steps["$tuple"].insert(
            0,
            {
                "$type": "umf_access.dsl._nodes.Node",
                "fields": {"args": {"$tuple": []}, "op": "future-step"},
            },
        )
        result = render_variant(
            {"profile": "umf-access-logical-render/0.1.0", "variant": changed}
        )
        self.assertEqual(result["outcome"], "refused")
        self.assertEqual(result["code"], "CAPTURE_UNSUPPORTED")
        self.assertEqual(
            result["message"], "Record requires authored namespace and logical name"
        )

    def test_empty_rendered_field_name_matches_python_refusal(self):
        _, variant, _ = next(item for item in _variants() if item[0] == "filtered")
        changed = copy.deepcopy(variant)
        record, steps = changed["fields"]["node"]["fields"]["args"]["$tuple"]
        predicate = steps["$tuple"][0]["fields"]["args"]["$tuple"][0]
        selected_field = predicate["fields"]["args"]["$tuple"][0]["fields"]["args"]["$tuple"][0]
        selected_field["fields"]["logical_name"] = ""
        result = render_variant(
            {"profile": "umf-access-logical-render/0.1.0", "variant": changed}
        )
        self.assertEqual(result["outcome"], "refused")
        self.assertEqual(result["code"], "CAPTURE_UNSUPPORTED")
        self.assertEqual(result["message"], "Field has no authored logical name")


if __name__ == "__main__":
    unittest.main()
