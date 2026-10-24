# SPDX-License-Identifier: MIT OR Apache-2.0
from copy import deepcopy
import pytest

from umf import _rust
from umf import rust_json_schema as schema


def test_opt_in_host_round_trips_native_schema_and_resources():
    source = '{"$ref":"https://example.test/defs.json"}'
    resources = {
        "https://example.test/defs.json": {"type": "string"},
        "https://example.test/other.json": {"type": "number"},
    }
    # Public resources take JSON Schema objects and are serialized as text in
    # insertion order for the closed native wire dispatcher.
    resources = {uri: __import__("json").dumps(value, separators=(",", ":"))
                 for uri, value in resources.items()}
    document = schema.import_json_schema(
        source, "json-schema", "https://example.test/root.json", resources
    )
    assert schema.export_json_schema(document) == {"$ref": "https://example.test/defs.json"}
    assert list(schema.export_json_schema_resources(document)) == list(resources)
    assert schema.export_json_schema_resources(document) == {
        uri: __import__("json").loads(text) for uri, text in resources.items()
    }
    bundle = schema.export_json_schema_bundle(document)
    assert bundle["root"] == {"$ref": "https://example.test/defs.json"}
    assert list(bundle["resources"]) == list(resources)
    assert schema.inspect(document)["valid"] is True
    assert schema.walk(document)
    assert schema.get_node(document, "") == {
        "kind": "object", "members": {"$ref": {
            "kind": "string", "value": "https://example.test/defs.json"
        }}
    }


def test_profile_and_operation_controls_are_strict():
    assert schema.profile_version() == "umf-r5-json-schema/0.1.0"
    document = schema.import_json_schema("true", "schema", "https://example.test/root")
    with pytest.raises(_rust.UmfCoreError) as caught:
        schema.inspect(document, max_work=0)
    assert caught.value.code == "RESOURCE_LIMIT"
    with pytest.raises(_rust.UmfCoreError) as caught:
        schema._call("inspectJsonSchema", {"document": document},
                     meter=lambda amount: (_ for _ in ()).throw(RuntimeError("stop")))
    assert caught.value.code == "METER_FAILURE"

    work = []
    controlled = schema.inspect(document, meter=work.append)
    assert controlled == schema.inspect(document)
    assert work and sum(work) > 0

    errors = []
    for controls in ({}, {"meter": lambda amount: None}):
        with pytest.raises(_rust.UmfCoreError) as caught:
            schema.import_json_schema("{", "invalid", "https://example.test/root", **controls)
        errors.append((caught.value.code, str(caught.value)))
    assert errors[0] == errors[1]

    events = []
    charge, _ = schema._controls(
        None, lambda amount: events.append(("meter", amount)),
        lambda: events.append(("cancel", None)) or False,
        lambda: events.append(("clock", None)) or 0, 10,
    )
    assert charge(1) is None
    assert events == [("meter", 1), ("cancel", None), ("clock", None)]


def test_import_preflights_controls_before_resource_traversal():
    class HostileMapping:
        visited = False

        def items(self):
            self.visited = True
            raise AssertionError("host traversal ran before admission")

    resources = HostileMapping()
    with pytest.raises(_rust.UmfCoreError) as caught:
        schema.import_json_schema(
            "true", "schema", "https://example.test/root", resources,
            is_cancelled=lambda: True,
        )
    assert caught.value.code == "CANCELLED"
    assert resources.visited is False

    with pytest.raises(_rust.UmfCoreError) as caught:
        schema.import_json_schema(
            "true", "schema", "https://example.test/root", {}, max_work=0
        )
    assert caught.value.code == "RESOURCE_LIMIT"


def test_unbounded_native_number_tokens_survive_root_resources_and_bundle():
    huge_integer = "9" * 5001
    huge_exponent = "1e" + "9" * 80
    root_source = '{"const":' + huge_integer + ',"minimum":' + huge_exponent + '}'
    resource_source = '{"maximum":' + huge_exponent + ',"multipleOf":' + huge_integer + '}'
    uri = "https://example.test/numbers.json"
    document = schema.import_json_schema(
        root_source, "numbers", "https://example.test/root.json", {uri: resource_source}
    )

    root = schema.export_json_schema(document)
    resources = schema.export_json_schema_resources(document)
    bundle = schema.export_json_schema_bundle(document)
    for value in (root, resources[uri], bundle["root"], bundle["resources"][uri]):
        assert all(isinstance(number, schema.ExactJsonNumber) for number in value.values())
    assert root["const"].lexeme == huge_integer
    assert root["minimum"].lexeme == huge_exponent
    assert resources[uri]["maximum"].lexeme == huge_exponent
    assert resources[uri]["multipleOf"].lexeme == huge_integer
    assert deepcopy(root["const"]) is root["const"]
    assert schema.dump_native_json(root) == root_source
    assert schema.dump_native_json(resources[uri]) == resource_source
    assert bundle["root"]["const"].lexeme == huge_integer
    assert bundle["root"]["minimum"].lexeme == huge_exponent
    assert bundle["resources"][uri]["maximum"].lexeme == huge_exponent
    assert bundle["resources"][uri]["multipleOf"].lexeme == huge_integer
