"""Bulk metadata/value controls; these do not grant native execution authority."""

import json
import unittest
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from pydantic import ValidationError
from umf_access.build.commands import CommandBuildError, compile_command
from umf_access.capture import CapturedVariant
from umf_access.dsl import FieldRef, Node
from umf_access.native_actions import native_input_value
from umf_access.postgres_bulk import _bulk_input_value, _validate_parameters
from umf_access.protocols import ActionRefused
from umf_access.reviewed import ReadBuildError, parameter_signature


class BulkListParameterTests(unittest.TestCase):
    def test_strict_original_list_facets_and_scalar_action_role(self):
        parameters = [
            {"name": "ids", **parameter_signature(list[str | None])},
            {"name": "status", **parameter_signature(str)},
        ]
        _validate_parameters(
            parameters, {"ids": [None, "x", "x"], "status": "ok"}, {"status": "status"}
        )
        _validate_parameters(
            parameters, {"ids": [], "status": "ok"}, {"status": "status"}
        )
        for bad in (None, ("x",), [1], [True], ["x"] * 1001):
            with (
                self.subTest(bad=type(bad).__name__),
                self.assertRaises(ReadBuildError),
            ):
                _validate_parameters(parameters, {"ids": bad, "status": "ok"}, {})
        with self.assertRaises(ValidationError):
            _validate_parameters(
                parameters, {"ids": [], "status": 1}, {"status": "status"}
            )
        with self.assertRaises(ActionRefused):
            _validate_parameters(
                parameters, {"ids": [], "status": "ok"}, {"status": "ids"}
            )
        for facets in (
            {"nullable": True},
            {"elementNullable": 1},
            {"maxItems": True},
            {"maxItems": 1001},
            {"container": "array"},
            {"unexpected": 1},
        ):
            with self.subTest(facets=facets), self.assertRaises(ReadBuildError):
                _validate_parameters([{**parameters[0], **facets}], {"ids": []}, {})
        with self.assertRaises(ReadBuildError):
            _validate_parameters(
                [{"name": "ids", **parameter_signature(list[str])}], {"ids": [None]}, {}
            )

    def test_exact_element_domain_and_bulk_only_custody_encoding(self):
        values = [9007199254740993, None, -9007199254740993]
        _validate_parameters(
            [{"name": "ids", **parameter_signature(list[int | None])}],
            {"ids": values},
            {},
        )
        self.assertEqual(
            _bulk_input_value(values),
            [
                {"integerToken": "9007199254740993"},
                None,
                {"integerToken": "-9007199254740993"},
            ],
        )
        self.assertEqual(
            _bulk_input_value([Decimal("-0.00")]), [{"decimalToken": "-0.00"}]
        )
        for bad in ([True], [1.0]):
            with self.assertRaises(ReadBuildError):
                _validate_parameters(
                    [{"name": "ids", **parameter_signature(list[int])}],
                    {"ids": bad},
                    {},
                )
        with self.assertRaises(ReadBuildError):
            _validate_parameters(
                [{"name": "ids", **parameter_signature(list[Decimal])}],
                {"ids": [Decimal("NaN")]},
                {},
            )
        with self.assertRaises(ActionRefused):
            native_input_value(values)  # Scalar action-input API remains closed.
        with self.assertRaises(ActionRefused):
            _bulk_input_value([[1]])

    def test_command_retains_selection_list_descriptor_and_scalar_assignment(self):
        field = FieldRef("sales", "order", "status", logical_name="status")
        key = FieldRef("sales", "order", "id", logical_name="id")
        record = SimpleNamespace(
            objects=SimpleNamespace(ref=SimpleNamespace(key=(key,)))
        )
        action = {
            "binding": {
                "effects": [
                    {
                        "kind": "set",
                        "values": [
                            {
                                "field": {"module": "sales", "element": "status"},
                                "value": {"parameter": "newStatus"},
                            }
                        ],
                    }
                ]
            }
        }
        request = {
            "binding": {"modelJson": json.dumps({"actions": [action]})},
            "source": {"actionPointer": "/actions/0"},
            "target": "postgresql18",
        }
        variant = CapturedVariant(
            (),
            Node(
                "update",
                (
                    object(),
                    (Node("filter", (Node("param", ("ids",)),)),),
                    ((field, Node("param", ("status",))),),
                ),
            ),
            (),
        )

        def compile(parameters):
            with (
                patch(
                    "umf_access.build.commands.render_logical",
                    return_value="owner selection placeholder",
                ),
                patch(
                    "umf_access.build.commands.NativeProgram.build",
                    side_effect=lambda compiler, original, **kw: original,
                ),
            ):
                return compile_command(
                    object(),
                    object(),
                    variant,
                    record,
                    {"binding": {}, "maxItems": 3},
                    request,
                    "a" * 64,
                    parameters,
                )

        original = compile({"ids": (list[str | None], False), "status": (str, False)})
        self.assertEqual(
            original["selection"]["parameters"],
            [{"name": "ids", **parameter_signature(list[str | None])}],
        )
        self.assertEqual(
            original["parameters"],
            [
                {"name": "ids", **parameter_signature(list[str | None])},
                {"name": "status", **parameter_signature(str)},
            ],
        )
        self.assertEqual(original["actionInputs"], {"newStatus": "status"})
        with self.assertRaises(CommandBuildError):
            compile({"ids": (list[str], False), "status": (list[str], False)})
        with self.assertRaises(CommandBuildError):
            compile({"ids": (list[str] | None, False), "status": (str, False)})
