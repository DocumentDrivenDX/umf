"""Finite reachable typed-factory graph controls; native oracle is separate."""
import importlib.util
import json
import sys
import unittest
from pathlib import Path

from umf_access.capture import capture
from umf_access.dsl import nullable_join_owners

ROOT = Path(__file__).resolve().parents[3]


class JoinRefinementMatrix(unittest.TestCase):
    def test_every_reachable_graph_edge_and_phase_matches_explicit_sql_table(self):
        path = ROOT / "tests/compilation/python/static/joins/refinement_matrix.py"
        spec = importlib.util.spec_from_file_location("join_refinement_matrix_controls", path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        matrix = json.loads(path.with_suffix(".json").read_text())
        self.assertEqual(len(matrix["cases"]), 152)
        owners = (module.Order.objects.ref, module.one.ref, module.two.ref, module.three.ref)
        for case in matrix["cases"]:
            with self.subTest(case=case["name"]):
                declaration = capture(getattr(module, case["name"]))
                steps = declaration.variants[0].node.args[1]
                actual = nullable_join_owners(steps)
                expected = frozenset((owner.module,owner.element,owner.alias) for index,owner in enumerate(owners[:case["ownerCount"]]) if index and case["nullableMask"] & (1 << (index-1)))
                self.assertEqual(actual, expected)
                self.assertEqual(sum(s.op == "join" for s in steps), case["priorEdges"]+1)

    def test_malformed_duplicate_owner_graph_refuses_without_looping(self):
        from dataclasses import replace

        from commerce import Order
        from umf_access.dsl import Node
        relation = replace(Order.c.customer, target=Order.objects.ref)
        with self.assertRaisesRegex(ValueError, "distinct explicit alias"):
            nullable_join_owners((Node("join",(relation,"inner")),))
