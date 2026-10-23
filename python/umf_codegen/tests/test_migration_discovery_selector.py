# SPDX-License-Identifier: MIT OR Apache-2.0
"""Keep historical discovery calls stable while exposing explicit G03 selection."""
import unittest
from unittest.mock import patch

from umf_codegen import GenerationError, discover_table_migration_changes


class DiscoverySelector(unittest.TestCase):
    def setUp(self):
        self.previous = {"bundle": "previous"}
        self.next = {"bundle": "next"}
        self.candidate = {
            "id": "review-default",
            "kind": "change-default",
            "path": "/modules/0/extensions/umf.tables/tables/0/columns/0/default",
            "oldDigest": "a" * 64,
            "newDigest": "b" * 64,
            "oldValue": None,
            "newValue": {"kind": "literal", "value": {"string": "x"}},
        }

    def test_legacy_call_omits_selector_and_preserves_output(self):
        with patch("umf_codegen.execute", return_value={"changes": [self.candidate]}) as execute:
            self.assertEqual(discover_table_migration_changes(self.previous, self.next), [self.candidate])
        execute.assert_called_once_with(
            {"previous": self.previous, "next": self.next}, 30,
            operation="discover_changes",
        )

    def test_selector_is_forwarded_only_when_explicit(self):
        selector = {"version": "umf.table-migration-discovery/0.2"}
        with patch("umf_codegen.execute", return_value={"changes": [self.candidate]}) as execute:
            self.assertEqual(discover_table_migration_changes(
                self.previous, self.next, options=selector,
            ), [self.candidate])
        execute.assert_called_once_with(
            {"previous": self.previous, "next": self.next, "options": selector}, 30,
            operation="discover_changes",
        )

    def test_explicit_none_is_the_legacy_profile(self):
        with patch("umf_codegen.execute", return_value={"changes": []}) as execute:
            self.assertEqual(discover_table_migration_changes(
                self.previous, self.next, options=None,
            ), [])
        execute.assert_called_once_with(
            {"previous": self.previous, "next": self.next}, 30,
            operation="discover_changes",
        )

    def test_invalid_selector_refusal_is_propagated(self):
        selector = {"version": "umf.table-migration-discovery/0.1"}
        with patch("umf_codegen.execute", side_effect=GenerationError(
                "MIGRATION_CHANGES_FAILED", "Unknown table-migration discovery selector")):
            with self.assertRaisesRegex(GenerationError, "Unknown table-migration discovery selector"):
                discover_table_migration_changes(self.previous, self.next, options=selector)  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
