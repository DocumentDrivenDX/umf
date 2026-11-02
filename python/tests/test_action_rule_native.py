# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public Python compiler-wrapper baseline for the Rust action evaluator."""
import json
from pathlib import Path
import unittest
from umf.rust_codegen import CodegenEngine, UmfCodegenError


class ActionRuleBaseline(unittest.TestCase):
    def test_typed_integer_equality_and_unknown_operator_refusal(self):
        root = Path(__file__).resolve().parents[2]
        paths = {
            "coreSchema": "spec/core/schema.json",
            "referenceSchema": "spec/core/semantic-type-reference.schema.json",
            "packageSchema": "spec/core/extension-package.schema.json",
            "constraints": "spec/metamodel/generated/core-constraints.json",
            "domainPolicy": "spec/metamodel/generated/domain-policy.json",
            "tablesPackage": "spec/extensions/tables/package.json",
            "actionsPackage": "spec/extensions/actions/package.json",
            "bindingPackage": "spec/extensions/binding/package.json",
            "stableBindingPackage": "spec/extensions/binding-stable/package.json",
        }
        engine = CodegenEngine({name: json.loads((root / path).read_text())
                                for name, path in paths.items()})
        document = json.loads((root / "fixtures/actions/approve.json").read_text())
        action = document["modules"][0]["extensions"]["umf.actions"]["actions"][0]
        state = {"inputs": {"order": {"key": {"module": "sales", "element": "order", "key": "pk"},
                 "components": [{"string": "o1"}]}}, "pre": {"frames": {}, "links": []}}
        rule = {"language": "umf.actions.rules", "version": "1", "references": [],
                "expression": json.dumps({"op": "eq", "args": [
                    {"literal": {"integerToken": "1e2"}}, {"literal": {"integerToken": "100"}}]})}
        self.assertTrue(engine.evaluate_action_rule(document, action, rule, "pre", state))
        rule["expression"] = json.dumps({"op": "future", "args": []})
        with self.assertRaises(UmfCodegenError) as refused:
            engine.evaluate_action_rule(document, action, rule, "pre", state)
        self.assertEqual(refused.exception.code, "ACTION_RULE_SYNTAX")


if __name__ == "__main__":
    unittest.main()
