# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust source-inventory join against a frozen Python predecessor."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from umf_access.build.catalog import CatalogBuildError, _check_native_column_sources
from umf_access.rust_catalog_custody import check_sources

ROOT = Path(__file__).resolve().parents[3]
PACKET = ROOT / "python/umf_access/tests/fixtures/rust-catalog-source-join/predecessor.json"
ERROR_CODES = {
    "invalid stage-one source inventory": "SOURCE_INVENTORY_SHAPE",
    "native binding differs from retained stage-one source": "SOURCE_MEMBERSHIP",
}


def predecessor(case: dict[str, object]) -> dict[str, str]:
    """Replay the actual filesystem-owning predecessor over packet inputs."""
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        path = root / "shop/_umf/sources.json"
        path.parent.mkdir(parents=True)
        data = json.dumps(case["sources"], separators=(",", ":")).encode("utf-8")
        path.write_bytes(data)
        manifest = {
            "inventory": [
                {"path": "shop/_umf/sources.json", "sha256": hashlib.sha256(data).hexdigest()}
            ]
        }
        bindings = case["bindings"]
        target = (
            {"binding": {"nativeColumns": {"sets": [{"binding": item} for item in bindings]}}}
            if bindings
            else {}
        )
        try:
            _check_native_column_sources([target], manifest, root, "shop")
            return {"status": "returned"}
        except CatalogBuildError as error:
            return {"status": "refused", "message": str(error)}


class RustCatalogSourceJoinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.packet = json.loads(PACKET.read_text(encoding="utf-8"))

    def test_packet_pins_current_python_predecessor(self) -> None:
        source = ROOT / "python/umf_access/src/umf_access/build/catalog.py"
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), self.packet["sourceSha256"])

    def test_rust_matches_frozen_and_live_python_outcomes(self) -> None:
        for case in self.packet["cases"]:
            with self.subTest(case=case["name"]):
                expected = predecessor(case)
                self.assertEqual(expected, case["expected"])
                native = check_sources(case["bindings"], case["sources"])
                if expected["status"] == "returned":
                    self.assertEqual(native, {"outcome": "returned"})
                else:
                    message = expected["message"]
                    self.assertEqual(
                        native,
                        {"outcome": "refused", "code": ERROR_CODES[message], "message": message},
                    )

    def test_non_json_python_values_fail_before_rust_comparison(self) -> None:
        with self.assertRaises(ValueError):
            check_sources([], [object()])


if __name__ == "__main__":
    unittest.main()
