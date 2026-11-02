# SPDX-License-Identifier: MIT OR Apache-2.0
"""Focused Rust opt-in parity for the closed Truss metadata component rule."""
import unittest

from umf_access.related_keys import _truss_component_type
from umf_access.rust_related_keys import truss_component_type_matches
from umf_access.types import RelatedKeyParserUnavailable


class RustTrussComponentProfile(unittest.TestCase):
    def test_closed_component_matrix_matches_python_predecessor(self):
        cases = [
            ({"family": "string", "facets": {}, "nullable": False}, "string"),
            ({"family": "boolean", "facets": {}, "nullable": False}, "boolean"),
            ({"family": "integer", "facets": {}, "nullable": False}, "integer"),
            ({"family": "integer", "facets": {"integerWidth": {"bits": 64, "signed": True}}, "nullable": False}, "integer"),
            ({"family": "decimal", "facets": {"precision": 18, "scale": 4}, "nullable": False}, "decimal"),
            ({"family": "decimal", "facets": {"precision": 18, "scale": 2}, "nullable": False}, "decimal"),
            ({"family": "decimal", "facets": {"precision": 12, "scale": 2}, "nullable": False}, "decimal"),
            ({"family": "string", "facets": {"maxLength": 12}, "nullable": False}, "string"),
            ({"family": "integer", "facets": {"integerWidth": {"bits": 32, "signed": True}}, "nullable": False}, "integer"),
            ({"family": "integer", "facets": {"integerWidth": {"bits": 64, "signed": False}}, "nullable": False}, "integer"),
            ({"family": "decimal", "facets": {"precision": 18.0, "scale": 4}, "nullable": False}, "decimal"),
            ({"family": "decimal", "facets": {"precision": 18, "scale": True}, "nullable": False}, "decimal"),
            ({"family": "date", "facets": {}, "nullable": False}, "date"),
            ({"family": "string", "facets": {}, "nullable": 0}, "string"),
        ]
        for value, carrier in cases:
            with self.subTest(value=value, carrier=carrier):
                self.assertEqual(
                    truss_component_type_matches(value, carrier),
                    _truss_component_type(value, carrier),
                )

    def test_non_exact_inputs_are_refused_by_opt_in(self):
        class DictSubclass(dict):
            pass

        shared = {"nested": []}
        for value, carrier in (
            (DictSubclass(family="string", facets={}, nullable=False), "string"),
            ({"family": "string", "facets": {}, "nullable": False}, object()),
            ({"family": "string", "facets": {"x": shared, "y": shared}, "nullable": False}, "string"),
        ):
            with self.subTest(value_type=type(value), carrier_type=type(carrier)), self.assertRaises(RelatedKeyParserUnavailable):
                    truss_component_type_matches(value, carrier)

        cycle = {}
        cycle["self"] = cycle
        with self.assertRaises(RelatedKeyParserUnavailable):
            truss_component_type_matches(cycle, "string")


if __name__ == "__main__":
    unittest.main()
