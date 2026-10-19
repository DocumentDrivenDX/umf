from __future__ import annotations

import asyncio
import hashlib
import json
import unittest
from collections.abc import Mapping

from umf_access.unified import WeftTableBinding


class UnifiedBindingIdentityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.model = {
            "umf": "0.10.0",
            "modules": [
                {
                    "id": "sales.region",
                    "namespace": "example.sales",
                    "elements": [
                        {"id": "code", "name": "code", "kind": "field", "scalarType": "string", "cardinality": "one", "nullability": "required"},
                        {
                            "id": "Order",
                            "name": "Order",
                            "kind": "record",
                            "members": [{"module": "sales.region", "element": "code"}],
                            "keys": [{"id": "external", "name": "external", "primary": False,
                                      "fields": [{"module": "sales.region", "element": "code"}]}],
                        },
                    ],
                    "extensions": {
                        "umf.actions": {
                            "actions": [
                                {"id": "fulfill.fast", "parameters": []},
                                {"id": "set.code", "parameters": [{
                                    "id": "replacement",
                                    "kind": "value",
                                    "field": {"module": "sales.region", "element": "code"},
                                    "required": True,
                                }]},
                            ]
                        }
                    },
                }
            ],
        }
        model_json = json.dumps(self.model, separators=(",", ":"))
        self.schema = hashlib.sha256(model_json.encode("utf-8")).hexdigest()
        self.binding: dict[str, object] = {
            "version": "umf.raw-read-binding/0.1",
            "modelJson": model_json,
            "modelSha256": self.schema,
            "tables": [{
                "logical": ["example.sales", "Order"],
                "native": "orders",
                "key": ["code"],
                "columns": [{"logical": "code", "native": "code", "carrier": "string", "nullable": False}],
            }],
            "relationships": [],
        }

    def _binding_with_field(self, changes: Mapping[str, object], *, remove: tuple[str, ...] = ()) -> tuple[dict[str, object], str]:
        model = json.loads(json.dumps(self.model))
        field = model["modules"][0]["elements"][0]
        for key in remove:
            field.pop(key, None)
        field.update(changes)
        model_json = json.dumps(model, separators=(",", ":"))
        schema = hashlib.sha256(model_json.encode("utf-8")).hexdigest()
        binding = dict(self.binding)
        binding["modelJson"] = model_json
        binding["modelSha256"] = schema
        return binding, schema

    def test_read_refuses_unavailable_or_extended_scalar_fields_before_weft(self) -> None:
        class Compiler:
            calls = 0

            def compile_raw_read_json(self, _request: str) -> object:
                self.calls += 1
                return {}

        invalid_shapes = [
            ({}, ("cardinality",)),
            ({"cardinality": "array"}, ()),
            ({"cardinality": "unspecified"}, ()),
            ({}, ("nullability",)),
            ({"nullability": "unknown"}, ()),
            ({"scalarType": "unknown-carrier"}, ()),
            ({"extensions": {"foreign": {"meaning": "uninterpreted"}}}, ()),
            ({"extensions": {"hohfeld.view": "not-an-object"}}, ()),
            ({"extensions": {"hohfeld.view": {}, "foreign": {}}}, ()),
            ({"extensions": None}, ()),
        ]
        for changes, remove in invalid_shapes:
            with self.subTest(changes=changes, remove=remove):
                binding_json, schema = self._binding_with_field(changes, remove=remove)
                compiler = Compiler()
                binding = WeftTableBinding(binding_json, compiler, self._execute, target="postgresql18")
                response = asyncio.run(binding.execute({
                    "contract": "umf.access/1",
                    "schema": schema,
                    "kind": "read",
                    "query": {"record": "sales.region.Order"},
                    "size": 1,
                }))
                self.assertEqual(response.get("error", {}).get("code"), "UNSUPPORTED")
                self.assertEqual(compiler.calls, 0)

    def test_value_parameter_refuses_unavailable_or_extended_field_before_action(self) -> None:
        calls: list[str] = []

        async def action_executor(action: str, _inputs: Mapping[str, object], _key: str | None) -> Mapping[str, object]:
            calls.append(action)
            return {"schema": self.schema}

        invalid_shapes = [
            ({}, ("cardinality",)),
            ({"cardinality": "array"}, ()),
            ({"cardinality": "unspecified"}, ()),
            ({}, ("nullability",)),
            ({"nullability": "unknown"}, ()),
            ({"scalarType": "unknown-carrier"}, ()),
            ({"extensions": {"foreign": {"meaning": "uninterpreted"}}}, ()),
            ({"extensions": {"hohfeld.view": None}}, ()),
            ({"extensions": {"hohfeld.view": {}, "foreign": {}}}, ()),
            ({"extensions": None}, ()),
        ]
        for changes, remove in invalid_shapes:
            with self.subTest(changes=changes, remove=remove):
                binding_json, schema = self._binding_with_field(changes, remove=remove)
                binding = WeftTableBinding(
                    binding_json, object(), self._execute, target="postgresql18", action_executor=action_executor
                )
                response = asyncio.run(binding.execute({
                    "contract": "umf.access/1",
                    "schema": schema,
                    "kind": "apply",
                    "action": "sales.region.set.code",
                    "inputs": {"replacement": "next"},
                    "idempotency_key": None,
                }))
                self.assertEqual(response.get("error", {}).get("code"), "UNSUPPORTED")
                self.assertEqual(calls, [])

    def test_sole_non_primary_key_is_selected(self) -> None:
        binding = WeftTableBinding(self.binding, object(), self._execute, target="postgresql18")
        record, _decl, _fields, _info = binding._record("sales.region.Order")
        self.assertEqual(record.key_id, "external")
        self.assertEqual([field.field for field in record.key], ["code"])

    def test_empty_field_extensions_preserve_admitted_scalar_selection(self) -> None:
        binding_json, _schema = self._binding_with_field({"extensions": {}})
        binding = WeftTableBinding(binding_json, object(), self._execute, target="postgresql18")
        record, _decl, _fields, _info = binding._record("sales.region.Order")
        self.assertEqual([field.field for field in record.key], ["code"])

    def test_known_presentation_metadata_is_retained_for_reads_and_action_values(self) -> None:
        view = {"label": "Code", "format": "badge", "tones": {"next": "teal"},
                "unknownPresentation": {"original": [1, None]}}
        binding_json, schema = self._binding_with_field({"extensions": {"hohfeld.view": view}})
        received: list[dict[str, object]] = []

        async def action_executor(_action: str, inputs: Mapping[str, object], _key: str | None) -> Mapping[str, object]:
            received.append(dict(inputs))
            return {"schema": schema}

        binding = WeftTableBinding(
            binding_json, object(), self._execute, target="postgresql18", action_executor=action_executor
        )
        _record, _decl, _fields, info = binding._record("sales.region.Order")
        self.assertEqual(info["fields"]["code"]["extensions"]["hohfeld.view"], view)
        response = asyncio.run(binding.execute({
            "contract": "umf.access/1", "schema": schema, "kind": "apply",
            "action": "sales.region.set.code", "inputs": {"replacement": "next"},
            "idempotency_key": None,
        }))
        self.assertEqual(response, {"schema": schema})
        self.assertEqual(received, [{"replacement": "next"}])
        self.assertEqual(binding.model["modules"][0]["elements"][0]["extensions"]["hohfeld.view"], view)

    def test_dotted_module_and_action_ids_resolve_exactly(self) -> None:
        calls: list[str] = []

        async def action_executor(action: str, inputs: Mapping[str, object], key: str | None) -> Mapping[str, object]:
            calls.append(action)
            self.assertEqual(dict(inputs), {})
            self.assertIsNone(key)
            return {"schema": self.schema}

        binding = WeftTableBinding(
            self.binding, object(), self._execute, target="postgresql18", action_executor=action_executor
        )
        response = asyncio.run(binding.execute({
            "contract": "umf.access/1",
            "schema": self.schema,
            "kind": "apply",
            "action": "sales.region.fulfill.fast",
            "inputs": {},
            "idempotency_key": None,
        }))
        self.assertEqual(response, {"schema": self.schema})
        self.assertEqual(calls, ["sales.region.fulfill.fast"])

    def test_value_action_parameter_decodes_from_source_field(self) -> None:
        received: list[dict[str, object]] = []

        async def action_executor(action: str, inputs: Mapping[str, object], key: str | None) -> Mapping[str, object]:
            received.append(dict(inputs))
            return {"schema": self.schema}

        binding = WeftTableBinding(
            self.binding, object(), self._execute, target="postgresql18", action_executor=action_executor
        )
        response = asyncio.run(binding.execute({
            "contract": "umf.access/1",
            "schema": self.schema,
            "kind": "apply",
            "action": "sales.region.set.code",
            "inputs": {"replacement": "next"},
            "idempotency_key": None,
        }))
        self.assertEqual(response, {"schema": self.schema})
        self.assertEqual(received, [{"replacement": "next"}])

    async def _execute(self, _artifact: Mapping[str, object], _request: Mapping[str, object]) -> Mapping[str, object]:
        return {"schema": self.schema, "rows": []}


if __name__ == "__main__":
    unittest.main()
