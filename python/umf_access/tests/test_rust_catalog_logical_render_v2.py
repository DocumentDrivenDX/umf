# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import json
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from umf_access import rust_catalog_render_v2 as render

PROFILE = "umf-access-logical-render/0.2.0"


class RustCatalogLogicalRenderV2Tests(unittest.TestCase):
    def test_frozen_positive_packet_matches_python_logical_requests(self):
        packet_path = (
            Path(__file__).parent
            / "fixtures/rust-catalog-capture/logical-render-positive-v1.json"
        )
        packet = json.loads(packet_path.read_text(encoding="utf-8"))
        for declaration in packet["declarations"]:
            if "capture" not in declaration:
                continue
            fields = declaration["capture"]["fields"]
            for index, variant in enumerate(fields["variants"]["$tuple"]):
                expected = declaration["variants"][index]
                with self.subTest(
                    declaration=declaration["name"], variant=expected["index"]
                ):
                    actual = render.render_variant(variant)
                    self.assertEqual(actual["outcome"], expected["renderOutcome"])
                    self.assertEqual(
                        actual.get("logicalRequest"), expected.get("logicalRequest")
                    )

    def test_profile_and_explicit_envelope_dispatch(self):
        native = Mock()
        native.logical_render_full_profile_version.return_value = PROFILE
        native.render_logical_full_variant.return_value = {
            "profile": PROFILE,
            "outcome": "rendered",
            "logicalRequest": "all from invoice",
        }
        with patch.object(render, "_core", native):
            result = render.render_variant({"$type": "captured"}, owner_bound=True)
        self.assertEqual(result["logicalRequest"], "all from invoice")
        envelope = native.render_logical_full_variant.call_args.args[0]
        self.assertEqual(
            envelope,
            {
                "binding": None,
                "ownerBound": True,
                "profile": PROFILE,
                "variant": {"$type": "captured"},
            },
        )

    def test_missing_or_mismatched_profile_fails_before_render(self):
        native = Mock()
        native.logical_render_full_profile_version.return_value = "wrong-profile"
        with (
            patch.object(render, "_core", native),
            self.assertRaisesRegex(
                render.CatalogLogicalRenderV2Unavailable, "profile mismatch"
            ),
        ):
            render.render_variant({})
        native.render_logical_full_variant.assert_not_called()

    def test_captured_profile_preflight_precedes_object_encoding(self):
        native = Mock()
        native.logical_render_full_profile_version.return_value = "wrong-profile"
        with (
            patch.object(render, "_core", native),
            patch.object(render, "_encode_capture") as encode,
            self.assertRaisesRegex(
                render.CatalogLogicalRenderV2Unavailable, "profile mismatch"
            ),
        ):
            render.render_captured_variant(object())
        encode.assert_not_called()

    def test_missing_render_operation_fails_closed(self):
        native = Mock()
        native.logical_render_full_profile_version.return_value = PROFILE
        del native.render_logical_full_variant
        with (
            patch.object(render, "_core", native),
            self.assertRaises(render.CatalogLogicalRenderV2Unavailable),
        ):
            render.render_variant({})

    def test_invalid_response_is_rejected(self):
        native = Mock()
        native.logical_render_full_profile_version.return_value = PROFILE
        native.render_logical_full_variant.return_value = {
            "profile": PROFILE,
            "outcome": "rendered",
            "logicalRequest": 1,
        }
        with (
            patch.object(render, "_core", native),
            self.assertRaisesRegex(RuntimeError, "invalid result"),
        ):
            render.render_variant({})

    def test_non_boolean_owner_bound_refused_before_native_call(self):
        native = Mock()
        with (
            patch.object(render, "_core", native),
            self.assertRaisesRegex(TypeError, "owner_bound must be bool"),
        ):
            render.render_variant({}, owner_bound=1)
        native.logical_render_full_profile_version.assert_not_called()

    def test_native_malformed_variant_refusal_is_structured(self):
        result = render.render_variant({})
        self.assertEqual(
            result,
            {
                "profile": PROFILE,
                "outcome": "refused",
                "code": "CAPTURE_DTO_INVALID",
                "message": "captured variant shape is outside logical renderer profile",
            },
        )


if __name__ == "__main__":
    unittest.main()
