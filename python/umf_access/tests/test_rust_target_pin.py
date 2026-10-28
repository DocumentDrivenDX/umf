# SPDX-License-Identifier: MIT OR Apache-2.0
"""Direct parity and admission checks for the opt-in Rust target pin matcher."""

from __future__ import annotations

import importlib.machinery
import importlib.util
import json
import os
import unittest
from pathlib import Path

from umf import _rust
from umf_access.adoption import TargetIdentity
from umf_access.catalog import TargetPin
from umf_access.rust_target_pin import (
    TargetPinRustUnsupported,
    matches,
)

ROOT = Path(__file__).resolve().parents[3]
PACKET = (
    ROOT
    / "docs/helix/04-build/evidence/rust-migration/target-pin-python-predecessor-20261028/packet.json"
)
PACKET_SHA256 = "188e816ccad9ed609c1382ea8090471a5ed1266f412742e69b7800d32ed455ec"
PACKET_DUPLICATE_CASE = "duplicate-observed-name-misses-other-pinned-name"


def load_candidate_library() -> None:
    path = os.environ.get("UMF_TARGET_PIN_RUST_LIBRARY")
    if not path:
        return
    loader = importlib.machinery.ExtensionFileLoader("umf._rust_core", path)
    spec = importlib.util.spec_from_loader("umf._rust_core", loader)
    module = loader.create_module(spec)
    if module is None:
        raise RuntimeError("could not load candidate Rust extension")
    loader.exec_module(module)
    _rust._rust_core = module


class RustTargetPinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        load_candidate_library()
        core = getattr(_rust, "_rust_core", None)
        if not callable(getattr(core, "access_target_pin_matches", None)):
            raise unittest.SkipTest(
                "candidate Rust target pin binding is not installed"
            )

    def setUp(self) -> None:
        self.pin = TargetPin(
            "postgresql",
            "pg",
            "18",
            "profile-a",
            "a" * 64,
            (("driver", ("3.2", "3.3")), ("server", ("18.1",))),
        )

    def identity(self, platform: tuple[tuple[str, str], ...]) -> TargetIdentity:
        return TargetIdentity("postgresql", "pg", "18", "profile-a", "a" * 64, platform)

    def test_unique_components_match_python_public_method(self) -> None:
        identity = self.identity((("server", "18.1"), ("driver", "3.3")))
        self.assertEqual(matches(self.pin, identity), self.pin.matches(identity))
        self.assertTrue(matches(self.pin, identity))

    def test_duplicate_observed_names_refuse(self) -> None:
        for platform in (
            (("driver", "3.2"), ("driver", "3.3")),
            (("server", "18.1"), ("server", "18.1")),
        ):
            with self.subTest(platform=platform):
                identity = self.identity(platform)
                self.assertFalse(matches(self.pin, identity))
                self.assertFalse(self.pin.matches(identity))

    def test_duplicate_pinned_names_refuse(self) -> None:
        pin = TargetPin(
            "postgresql",
            "pg",
            "18",
            "profile-a",
            "a" * 64,
            (("driver", ("3.2",)), ("driver", ("3.3",))),
        )
        identity = self.identity((("driver", "3.2"), ("driver", "3.3")))
        self.assertFalse(matches(pin, identity))
        self.assertFalse(pin.matches(identity))

    def test_malformed_mutable_platform_carrier_is_refused(self) -> None:
        identity = self.identity((("driver", "3.2"), ("server", "18.1")))
        malformed = TargetPin(
            self.pin.kind,
            self.pin.backend_id,
            self.pin.backend_version,
            self.pin.target_profile,
            self.pin.binding_sha256,
            [("driver", ("3.2",)), ("server", ("18.0",))],  # type: ignore[arg-type]
        )
        with self.assertRaisesRegex(TargetPinRustUnsupported, "exact tuples"):
            matches(malformed, identity)

    def test_all_frozen_predecessor_cases_match_under_current_policy(self) -> None:
        packet = json.loads(PACKET.read_text(encoding="utf-8"))
        self.assertEqual(packet["format"], "umf-target-pin-python-predecessor/1")
        self.assertEqual(packet["source_sha256"], PACKET_SHA256)
        self.assertEqual(packet["case_count"], 13)
        self.assertEqual(len(packet["cases"]), 13)
        for case in packet["cases"]:
            with self.subTest(case=case["name"]):
                observed = tuple(tuple(pair) for pair in case["identity"]["platform"])
                raw = case["identity"]
                identity = TargetIdentity(
                    raw["kind"],
                    raw["backend_id"],
                    raw["backend_version"],
                    raw["target_profile"],
                    raw["binding_sha256"],
                    observed,
                )
                predecessor_expected = case["expected"]
                expected = (
                    False
                    if case["name"] == PACKET_DUPLICATE_CASE
                    else predecessor_expected
                )
                self.assertEqual(self.pin.matches(identity), expected)
                self.assertEqual(matches(self.pin, identity), expected)

    def test_native_binding_rejects_malformed_tuple_and_string_carriers(self) -> None:
        core = _rust._rust_core
        fields = ("postgresql", "pg", "18", "profile-a", "a" * 64)

        class StringSubclass(str):
            pass

        with self.assertRaisesRegex(TypeError, "exact tuple"):
            core.access_target_pin_matches(
                fields,
                [("driver", ("3.2",))],
                fields,
                (("driver", "3.2"),),
            )
        with self.assertRaisesRegex(TypeError, "exact str"):
            core.access_target_pin_matches(
                ("postgresql", "pg", "18", "profile-a", "a" * 64),
                ((StringSubclass("driver"), ("3.2",)),),
                fields,
                (("driver", "3.2"),),
            )


if __name__ == "__main__":
    unittest.main()
