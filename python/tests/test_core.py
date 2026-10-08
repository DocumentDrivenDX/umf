import json
from pathlib import Path

import pytest
from umf import (
    Document,
    Extension,
    Registry,
    core_schema,
    read_document,
    read_json_value,
    validate_document,
    write_document,
)

ROOT = Path(__file__).resolve().parents[1]
if not (ROOT / "fixtures/python").is_dir():
    ROOT = ROOT.parent
CASES = json.loads((ROOT / "fixtures/python/core-conformance.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_shared_semantic_subset(case):
    result = validate_document(case["document"])
    assert (result.valid, result.complete) == (case["valid"], case["complete"])


@pytest.mark.parametrize("version", [f"0.{i}.0" for i in range(1, 9)])
def test_canonical_versions(version):
    doc = Document.model_validate(
        {"umf": version, "id": "x", "vocabularies": {}, "modules": []}
    )
    assert doc.to_dict()["umf"] == version
    schema = core_schema(version)
    assert schema == json.loads(
        (
            ROOT
            / "spec/core"
            / __import__("umf.schemas", fromlist=["SCHEMAS"]).SCHEMAS[version]
        ).read_text()
    )
    schema.clear()
    assert core_schema(version)


def test_unknown_and_advanced_semantics_preserved():
    source = json.loads((ROOT / "fixtures/core/schema-properties.json").read_text())
    doc = Document.model_validate(source)
    assert not validate_document(doc).complete
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
    doc = Document.model_validate(CASES[0]["document"])
    doc.modules[0].elements[0].name = None
    with pytest.raises(ValueError):
        write_document(doc)


def test_unknown_python_alias_and_old_version_future_fields_are_not_reinterpreted():
    source = {
        "umf": "0.1.0",
        "id": "old",
        "vocabularies": {},
        "modules": [
            {
                "id": "m",
                "namespace": "old",
                "elements": [
                    {
                        "id": "e",
                        "extensions": {},
                        "scalar_type": {"future": None},
                        "facets": "uninterpreted",
                        "kind": ["future"],
                    }
                ],
            }
        ],
    }
    doc = Document.model_validate(source)
    assert doc.to_dict() == source
    assert not validate_document(doc).complete


def test_explicit_extension_registry_isolated_and_versioned():
    doc = {
        "umf": "0.8.0",
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
    assert validate_document(doc, registry).complete
    assert doc["extensions"]["test"] == {"value": "a"}
    with pytest.raises(ValueError):
        registry.register(extension)
    doc["vocabularies"]["test"]["version"] = "2.0.0"
    assert not validate_document(doc, registry).complete


def test_extension_scope_and_callback_failure():
    doc = {
        "umf": "0.8.0",
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
