# SPDX-License-Identifier: MIT OR Apache-2.0
"""Original bounded search filters preserve facets without widening action inputs."""

import copy
import json
import unittest
from decimal import Decimal
from pathlib import Path

from pydantic import ValidationError
from umf_access.native_program import NativeProgram, _search_parameter_custody
from umf_access.postgres_search import _filter_parameters
from umf_access.protocols import ActionRefused
from umf_access.reviewed import ReadBuildError, parameter_signature
from umf_access.search_catalog import SEARCH_FILTER_PARAMETER_ABI

ROOT = Path(__file__).resolve().parents[3] / "fixtures/access/search-parameter-custody"


class SearchParameterCustodyTests(unittest.TestCase):
    def test_original_successor_list_and_old_serialized_facet_loss(self):
        original = json.loads((ROOT / "successor-list-program.json").read_text())
        _search_parameter_custody(original, original["request"])
        for values in ([], [None], ["x", None, "x"]):
            _filter_parameters(original, {"ids": values})
        for values in (None, "x", [1], [True], ["x"] * 9, ["\x00"], ["\ud800"]):
            with self.subTest(values=values), self.assertRaises(ReadBuildError):
                _filter_parameters(original, {"ids": values})
        old = NativeProgram((ROOT / "r20-list-program.json").read_text(), "{}", "0" * 64)
        with self.assertRaisesRegex(ActionRefused, "NATIVE_SEARCH_PARAMETER_FACETS_REQUIRED"):
            old.checked()

    def test_each_original_input_slot_facet_and_request_echo_is_exact(self):
        original = json.loads((ROOT / "successor-list-program.json").read_text())
        for field, value in (("container", None), ("nullable", True), ("elementNullable", False), ("maxItems", 7), ("carrier", "integer")):
            bad = copy.deepcopy(original)
            slot = next(s for s in bad["statement"]["parameters"] if s["source"] == {"input": "ids"})
            slot[field] = value
            with self.subTest(field=field), self.assertRaises(ActionRefused):
                _search_parameter_custody(bad)
        requested = copy.deepcopy(original["request"])
        requested["selection"]["parameters"][0]["maxItems"] = 7
        with self.assertRaises(ActionRefused):
            _search_parameter_custody(original, requested)
        # An embedded source inventory is not an executed input binding.
        folded = copy.deepcopy(original)
        folded["statement"]["parameters"] = [s for s in folded["statement"]["parameters"] if s["source"] != {"input": "ids"}]
        with self.assertRaises(ActionRefused):
            _search_parameter_custody(folded)

    def test_actual_original_nullable_scalar_packet(self):
        original = json.loads((ROOT / "successor-nullable-program.json").read_text())
        _search_parameter_custody(original, original["request"])
        self.assertEqual(original["request"]["selection"]["parameters"], [{"name": "nullable_id", "carrier": "string", "nullable": True}])
        for value in (None, "d-1"):
            _filter_parameters(original, {"nullable_id": value})
        with self.assertRaises(ValidationError):
            _filter_parameters(original, {"nullable_id": False})
        old = NativeProgram((ROOT / "r20-nullable-program.json").read_text(), "{}", "0" * 64)
        with self.assertRaisesRegex(ActionRefused, "NATIVE_SEARCH_PARAMETER_FACETS_REQUIRED"):
            old.checked()

    def test_nullable_scalar_slot_and_strict_runtime_domain(self):
        descriptor = {"name": "value", **parameter_signature(str | None)}
        program = {"version": "weft.search/0.1", "request": {"selection": {"parameters": [descriptor]}}, "statement": {"sql": "original", "parameters": [{"source": {"input": "value"}, "carrier": "string", "nullable": True}]}}
        _search_parameter_custody(program)
        for value in (None, "x"):
            _filter_parameters(program, {"value": value})
        with self.assertRaises(ValidationError):
            _filter_parameters(program, {"value": 1})
        program["statement"]["parameters"][0].pop("nullable")
        with self.assertRaises(ActionRefused):
            _search_parameter_custody(program)
        for annotation, accepted, rejected in ((int, 2, True), (bool, True, 1), (Decimal, Decimal("1.20"), "1.20")):
            p = {"request": {"selection": {"parameters": [{"name": "value", **parameter_signature(annotation | None)}]}}}
            _filter_parameters(p, {"value": accepted})
            _filter_parameters(p, {"value": None})
            with self.assertRaises(ValidationError):
                _filter_parameters(p, {"value": rejected})

    def test_malformed_declarations_refuse_before_default_fastpath(self):
        original = json.loads((ROOT / "successor-list-program.json").read_text())
        for parameters in (None, {}, [{"name": "x", "carrier": "string", "nullable": 1}], [{"name": "x", "carrier": "unknown", "nullable": False}], [{"name": "x", "carrier": "string", "nullable": False}] * 2):
            bad = copy.deepcopy(original)
            bad["request"]["selection"]["parameters"] = parameters
            with self.subTest(parameters=parameters), self.assertRaises(ActionRefused):
                _search_parameter_custody(bad)
        template_only = copy.deepcopy(original)
        template_only["selectionTemplateOnly"] = template_only["statement"]
        template_only["statement"] = {"sql": "original", "parameters": []}
        with self.assertRaises(ActionRefused):
            _search_parameter_custody(template_only)

    def test_default_scalar_fastpath_and_nonnullable_list_container(self):
        scalar = {"version": "weft.search/0.1", "request": {"selection": {"parameters": [{"name": "value", "carrier": "string", "nullable": False}]}}, "statement": {"sql": "original", "parameters": [{"source": {"input": "value"}, "carrier": "string"}]}}
        before = copy.deepcopy(scalar)
        _search_parameter_custody(scalar)
        self.assertEqual(scalar, before)
        with self.assertRaises(ReadBuildError):
            parameter_signature(list[str] | None)
        self.assertEqual(SEARCH_FILTER_PARAMETER_ABI, "umf.search-filter-parameters/0.1")


if __name__ == "__main__":
    unittest.main()
