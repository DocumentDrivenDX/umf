# SPDX-License-Identifier: MIT OR Apache-2.0
import copy
import json
from pathlib import Path

import pytest
import umf
from umf import (
    Diagnostic,
    Document,
    Extension,
    Registry,
    core_schema,
    current_core_version,
    read_document,
    read_json_value,
    semantic_type_reference_schema,
    validate_document,
    write_document,
)
from umf.generated_resources import generated_resource
from umf.literal_kernel import literal_errors, numeric_interval

ROOT = Path(__file__).resolve().parents[1]
CONFORMANCE = json.loads(
    (ROOT.parent / "fixtures/metamodel/current-conformance.json").read_text()
)
CASES = CONFORMANCE["cases"]


def case_registry(case):
    spec = case.get("registry")
    registry = Registry()
    if spec is None:
        return registry

    def validate(payload, context):
        return [
            Diagnostic(
                "BASELINE_CALLBACK",
                context["path"],
                f"{context['document']['id']}:{context['scope']}:{payload['kind']}",
                "warning",
            )
        ]

    registry.register(
        Extension(
            spec["id"],
            spec["version"],
            (spec["scope"],),
            True,
            validate,
        )
    )
    return registry


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_current_core_conformance(case):
    result = validate_document(case["document"], case_registry(case))
    assert result.valid is case["valid"]
    assert result.complete is case["complete"]
    assert [diagnostic.__dict__ for diagnostic in result.diagnostics] == case[
        "diagnostics"
    ]


def test_only_generated_current_core_schema_is_active():
    assert current_core_version() == "0.10.0"
    schema = core_schema()
    assert schema["properties"]["umf"]["const"] == "0.10.0"
    assert schema == json.loads(
        (ROOT.parent / "spec/core/schema.json").read_text()
    )
    reference = semantic_type_reference_schema()
    assert reference["$id"] == "urn:umf:core:semantic-type-reference:1.0.0"
    schema.clear()
    assert core_schema()
    with pytest.raises(ValueError, match="Unsupported UMF core version"):
        core_schema("0.8.0")


def test_distribution_version_is_distinct_from_semantic_core_version():
    assert umf.__version__ == "0.11.0"
    assert current_core_version() == "0.10.0"


def test_literal_refinement_selection_and_order_come_from_generated_policy():
    case = next(case for case in CASES if case["id"] == "schema-properties/valid")
    document = case["document"]
    field = document["modules"][0]["elements"][0]
    policy = generated_resource("domain_policy")["literal"]
    value = {"integerToken": "9223372036854775808"}

    errors = literal_errors(document, field, value, True, policy)
    assert [error.code for error in errors] == ["CORE_SCHEMA_PROPERTIES"]
    assert errors[0].message == "Integer outside width/signedness"

    changed = copy.deepcopy(policy)
    allowed = next(rule for rule in changed["refinements"] if rule["mechanic"] == "allowed-membership")
    changed["refinements"].remove(allowed)
    assert literal_errors(document, field, {"integerToken": "3"}, True, changed) == []

    reordered = copy.deepcopy(policy)
    allowed = next(rule for rule in reordered["refinements"] if rule["mechanic"] == "allowed-membership")
    reordered["refinements"].remove(allowed)
    reordered["refinements"].insert(0, allowed)
    assert literal_errors(document, field, value, True, reordered)[0].message == "Literal is not an allowed value"


def test_numeric_interval_projects_nested_qualifiers_from_policy():
    case = next(case for case in CASES if case["id"] == "schema-properties/valid")
    field = copy.deepcopy(case["document"]["modules"][0]["elements"][0])
    field["facets"]["integerWidth"]["future"] = "ignored by this interval projection"
    policy = generated_resource("domain_policy")["literal"]
    interval = {"min": {"integerToken": "1"}, "max": {"integerToken": "2"}}
    assert numeric_interval(field, interval, policy) == []

    changed = copy.deepcopy(policy)
    changed["interval"]["qualifierKeys"]["integerWidth"] = ["bits", "signed", "future"]
    errors = numeric_interval(field, interval, changed)
    assert errors[0].code == "CORE_SCHEMA_PROPERTY_UNKNOWN"
    assert errors[0].message == "Unknown relevant qualifier: future"


def test_current_models_preserve_unknown_properties_and_round_trip():
    source = next(case["document"] for case in CASES if case["id"] == "schema-properties/valid")
    source["future"] = {"exact": [None, "content"]}
    doc = Document.model_validate(source)
    assert doc.to_dict() == source
    for format in ("json", "yaml"):
        assert read_document(write_document(doc, format), format).to_dict() == source
    copy = doc.checked_copy()
    copy.modules[0].elements[0].name = "changed"
    assert doc.modules[0].elements[0].name != "changed"


@pytest.mark.parametrize(
    "text,format",
    [
        ('{"x":1,"x":2}', "json"),
        ('{"x":9007199254740993}', "json"),
        ('{"x":-0}', "json"),
        ('{"x":-0.0}', "json"),
        ('{"x":0.10000000000000001}', "json"),
        ('{"x":NaN}', "json"),
        ("x: 1\nx: 2", "yaml"),
        ("x: &a [1]\ny: *a", "yaml"),
        ("x: !!str 1", "yaml"),
        ("%YAML 1.1\n---\nx: yes", "yaml"),
        ("1: value", "yaml"),
        ("x: 9007199254740993", "yaml"),
        ("x: -0", "yaml"),
        ("x: 0.10000000000000001", "yaml"),
    ],
)
def test_bad_text(text, format):
    with pytest.raises(ValueError):
        read_json_value(text, format)


def test_yaml_core_strings_and_exact_carriers():
    assert read_json_value("x: 2026-10-07\ny: yes", "yaml") == {
        "x": "2026-10-07",
        "y": "yes",
    }
    value = read_json_value('{"integerToken":"9007199254740993"}')
    assert value == {"integerToken": "9007199254740993"}


def test_mutable_model_revalidation():
    source = next(case["document"] for case in CASES if case["id"] == "schema-properties/valid")
    doc = Document.model_validate(source)
    doc.modules[0].elements[0].name = None
    with pytest.raises(ValueError):
        write_document(doc)


def test_older_core_documents_are_not_admitted_or_reinterpreted():
    source = {
        "umf": "0.8.0",
        "id": "old",
        "vocabularies": {},
        "modules": [],
        "future": {"exact": [None, "content"]},
    }
    with pytest.raises(ValueError, match="Unsupported UMF core version"):
        Document.model_validate(source)
    result = validate_document(source)
    assert not result.valid
    assert result.diagnostics[0].code == "SEMANTIC_TYPE_STRUCTURE"


def test_explicit_extension_registry_isolated_and_versioned():
    doc = {
        "umf": current_core_version(),
        "id": "x",
        "vocabularies": {"test": {"version": "1.0.0"}},
        "modules": [],
        "extensions": {"test": {"value": "a"}},
    }
    schema = {
        "type": "object",
        "required": ["value"],
        "properties": {"value": {"type": "string"}},
    }
    registry = Registry()

    def validate(payload, context):
        payload.clear()
        context["document"].clear()
        return []

    extension = Extension("test", "1.0.0", ("document",), schema, validate)
    registry.register(extension)
    schema.clear()
    assert validate_document(doc, registry).valid
    assert doc["extensions"]["test"] == {"value": "a"}
    with pytest.raises(ValueError):
        registry.register(extension)
    doc["vocabularies"]["test"]["version"] = "2.0.0"
    assert validate_document(doc, registry).valid
    assert not validate_document(doc, registry).complete


def test_extension_scope_and_callback_failure():
    doc = {
        "umf": current_core_version(),
        "id": "x",
        "vocabularies": {"test": {"version": "1.0.0"}},
        "modules": [],
        "extensions": {"test": {}},
    }
    registry = Registry()
    registry.register(Extension("test", "1.0.0", ("element",), True))
    assert not validate_document(doc, registry).valid
    registry = Registry()

    def fail(payload, context):
        raise RuntimeError("failure")

    registry.register(Extension("test", "1.0.0", ("document",), True, fail))
    assert validate_document(doc, registry).diagnostics[0].code == "VALIDATOR_FAILURE"
    with pytest.raises(ValueError):
        Registry().register(
            Extension(
                "remote", "1.0.0", ("document",), {"$ref": "https://example.com/schema"}
            )
        )


def test_consumer_schema_dialect_is_explicit():
    from umf import schema_validator

    validator = schema_validator(
        {"$schema": "http://json-schema.org/draft-07/schema#", "type": "string"}
    )
    assert validator.is_valid("value") and not validator.is_valid(1)
    with pytest.raises(ValueError, match="dialect"):
        schema_validator({"$schema": "urn:unknown:dialect"})
