# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed Python host-bridge checks for the Rust-backed current core."""

import struct

import pytest
from umf._rust import UmfCoreError
from umf.json import copy_json


def test_copy_json_preserves_order_raw_surrogates_and_positive_numeric_bits():
    source = {"z": -3.5, "a\ud800": [True, None, "x\udfff"]}
    copied = copy_json(source)
    assert list(copied) == list(source)
    assert list(copied)[1] == "a\ud800"
    assert copied["a\ud800"][2] == "x\udfff"
    assert struct.pack(">d", copied["z"]) == struct.pack(">d", -3.5)


def test_copy_json_preserves_python_codepoint_origins_and_refuses_core_key_collisions():
    explicit_pair = "\ud83d\ude00"
    astral_scalar = "\U0001f600"
    pair_copy = copy_json({explicit_pair: "pair"})
    scalar_copy = copy_json({astral_scalar: "scalar"})
    assert [ord(char) for char in next(iter(pair_copy))] == [0xD83D, 0xDE00]
    assert [ord(char) for char in next(iter(scalar_copy))] == [0x1F600]
    with pytest.raises(UmfCoreError):
        copy_json({explicit_pair: 1, astral_scalar: 2})


def test_document_to_dict_and_checked_copy_preserve_python_codepoints():
    from umf.models import Document

    explicit_pair = "\ud83d\ude00"
    document = Document.model_validate({
        "umf": "0.10.0",
        "id": explicit_pair,
        "vocabularies": {},
        "modules": [],
    })
    copied = document.to_dict()
    checked = document.checked_copy().to_dict()
    assert [ord(char) for char in copied["id"]] == [0xD83D, 0xDE00]
    assert [ord(char) for char in checked["id"]] == [0xD83D, 0xDE00]


def test_consumer_schema_keeps_explicit_pair_and_astral_keys_distinct():
    from umf.schemas import schema_validator

    explicit_pair = "\ud83d\ude00"
    astral_scalar = "\U0001f600"
    validator = schema_validator({
        "type": "object",
        "properties": {
            astral_scalar: {"const": 1},
            explicit_pair: {"const": 2},
        },
        "required": [astral_scalar, explicit_pair],
        "additionalProperties": False,
    })
    assert validator.is_valid({astral_scalar: 1, explicit_pair: 2})
    assert not validator.is_valid({astral_scalar: 2, explicit_pair: 1})


def test_python_consumer_snapshot_preserves_python_string_and_number_origins():
    from umf._rust import copy_python_consumer_value

    explicit_pair = "\ud83d\ude00"
    astral_scalar = "\U0001f600"
    nan_payload = 0x7FF8_0000_0000_0042
    source = {
        explicit_pair: 2**10_000,
        astral_scalar: float("inf"),
        "positive_zero": 0.0,
        "negative_zero": -0.0,
        "negative_infinity": float("-inf"),
        "nan": struct.unpack(">d", nan_payload.to_bytes(8, "big"))[0],
    }
    copied = copy_python_consumer_value(source)
    assert list(copied) == list(source)
    assert [ord(char) for char in next(iter(copied))] == [0xD83D, 0xDE00]
    assert [ord(char) for char in list(copied)[1]] == [0x1F600]
    assert copied[explicit_pair] == 2**10_000
    assert copied[astral_scalar] == float("inf")
    for key, bits in {
        "positive_zero": 0x0000_0000_0000_0000,
        "negative_zero": 0x8000_0000_0000_0000,
        astral_scalar: 0x7FF0_0000_0000_0000,
        "negative_infinity": 0xFFF0_0000_0000_0000,
        "nan": nan_payload,
    }.items():
        assert struct.unpack(">Q", struct.pack(">d", copied[key]))[0] == bits


@pytest.mark.parametrize("value", [-0.0, float("inf"), float("nan"), 2**53])
def test_copy_json_refuses_values_outside_the_interoperable_number_profile(value):
    with pytest.raises(UmfCoreError) as raised:
        copy_json(value)
    assert raised.value.code in {"NUMBER", "WIRE_FORMAT"}


def test_copy_json_returns_an_isolated_snapshot():
    source = {"items": [1, 2]}
    copied = copy_json(source)
    copied["items"].append(3)
    assert source == {"items": [1, 2]}


def test_copy_json_rejects_custom_containers_without_calling_their_methods():
    class HostileDict(dict):
        def items(self):
            raise AssertionError("must not call subclass items")

    with pytest.raises(UmfCoreError, match="exact built-in JSON values"):
        copy_json(HostileDict(x=1))


def test_copy_json_allows_aggregate_text_above_source_limit():
    copied = copy_json({"left": "a" * 3_000_000, "right": "b" * 3_000_000})
    assert len(copied["left"]) + len(copied["right"]) == 6_000_000


def test_yaml_value_count_boundary_counts_values_but_not_mapping_keys():
    from umf.serialization import read_json_value

    def mapping(count):
        return "".join(f"k{index:05d}: null\n" for index in range(count))

    assert len(read_json_value(mapping(99_999), "yaml")) == 99_999
    with pytest.raises(UmfCoreError) as raised:
        read_json_value(mapping(100_000), "yaml")
    assert raised.value.code == "LIMIT"


def test_engine_resource_bundle_does_not_add_an_aggregate_catalog_ceiling():
    from umf._rust import _rust_core, encode_wire
    from umf.generated_resources import generated_resource

    resources = [
        generated_resource("schema"),
        generated_resource("semantic_reference"),
        generated_resource("package_schema"),
        generated_resource("constraints"),
        generated_resource("domain_policy"),
    ]
    for index in range(3):
        resources[index] = {**resources[index], "examples": [None] * 450_000}
    assert sum(len(resource.get("examples", ())) for resource in resources) == 1_350_000
    _rust_core.NativeEngine(*(encode_wire(resource, catalog=True) for resource in resources))


def test_consumer_schema_errors_keep_compatible_paths_and_values():
    from umf.schemas import schema_validator

    validator = schema_validator({
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {"child": {"type": "string"}},
    })
    error = next(validator.iter_errors({"child": 3}))
    assert list(error.absolute_path) == ["child"]
    assert list(error.schema_path) == ["properties", "child", "type"]
    assert error.validator == "type"
    assert error.validator_value == "string"
    assert error.context == []


def test_schema_error_reconstructs_array_schema_path_and_nested_instance():
    from umf.schemas import _NativeSchemaError

    schema = {
        "properties": {
            "children": {
                "items": [{"type": "string"}],
            },
        },
    }
    instance = {"children": [9]}
    error = _NativeSchemaError({
        "message": "must be string",
        "keyword": "type",
        "params": {},
        "instancePath": "/children/0",
        "schemaPath": "/properties/children/items/0/type",
    }, instance, schema)
    assert list(error.absolute_path) == ["children", 0]
    assert list(error.absolute_schema_path) == ["properties", "children", "items", 0, "type"]
    assert error.instance == 9
    assert error.validator_value == "string"


def test_schema_validator_admits_schema_at_construction():
    from umf.schemas import schema_validator

    with pytest.raises(UmfCoreError):
        schema_validator({"type": "definitely-not-a-json-schema-type"})
    with pytest.raises(UmfCoreError):
        schema_validator({"$schema": "urn:unknown:dialect"})
    # Consumer mode retains jsonschema's inert unknown annotation behavior.
    assert schema_validator({"type": "string", "x-consumer-note": "inert"}).is_valid("ok")


def test_python_schema_validate_stops_at_first_error_before_recursive_branch():
    from umf.schemas import schema_validator

    validator = schema_validator({
        "type": "number",
        "allOf": [{"$ref": "#"}],
    })
    with pytest.raises(ValueError) as captured:
        validator.validate("bad")
    assert getattr(captured.value, "validator", None) == "type"
    assert not validator.is_valid("bad")


def test_python_schema_consumer_preserves_codepoints_bigints_and_float_bits():
    from umf.schemas import schema_validator

    explicit_pair = "\ud83d\ude00"
    astral_scalar = "\U0001f600"
    text_validator = schema_validator({"type": "string", "pattern": f"^{explicit_pair}$"})
    assert text_validator.is_valid(explicit_pair)
    assert not text_validator.is_valid(astral_scalar)

    integer_validator = schema_validator({"type": "integer"})
    assert integer_validator.is_valid(2**10_000)

    number_validator = schema_validator({"type": "number"})
    assert number_validator.is_valid(float("inf"))
    assert number_validator.is_valid(float("-inf"))
    assert number_validator.is_valid(float("nan"))

    with pytest.raises(UmfCoreError):
        schema_validator({"const": 2**10_000})


@pytest.mark.parametrize("source_number", [-0.0, float("inf"), float("nan"), 2**53])
def test_python_schema_source_keeps_the_predecessor_safe_number_profile(source_number):
    from umf.schemas import schema_validator

    with pytest.raises(UmfCoreError):
        schema_validator({"const": source_number})


def test_installed_python_cooperative_controls_are_polled_inside_rust_work():
    from umf import validate_document

    document = _callback_document()
    with pytest.raises(UmfCoreError) as raised:
        validate_document(document, max_work=0)
    assert raised.value.code == "RESOURCE_LIMIT"

    meter_calls = []
    validate_document(document, meter=meter_calls.append)
    assert meter_calls and all(amount > 0 for amount in meter_calls)

    polls = 0
    cancellation_threshold = max(4, len(meter_calls) // 2)

    def cancelled():
        nonlocal polls
        polls += 1
        return polls >= cancellation_threshold

    with pytest.raises(UmfCoreError) as raised:
        validate_document(document, is_cancelled=cancelled)
    assert raised.value.code == "CANCELLED"
    assert polls > 3

    clock_polls = 0

    def now():
        nonlocal clock_polls
        clock_polls += 1
        return 101 if clock_polls > max(4, len(meter_calls) // 2) else 99

    with pytest.raises(UmfCoreError) as raised:
        validate_document(document, now=now, deadline_ms=100)
    assert raised.value.code == "DEADLINE"
    assert clock_polls > 3

    with pytest.raises(UmfCoreError) as raised:
        validate_document(document, meter=lambda _amount: (_ for _ in ()).throw(RuntimeError("meter failed")))
    assert raised.value.code == "METER_FAILURE"
    assert str(raised.value) == "meter failed"

    explicit_pair = "\ud83d\ude00"
    with pytest.raises(UmfCoreError) as raised:
        validate_document(document, meter=lambda _amount: (_ for _ in ()).throw(RuntimeError(explicit_pair)))
    assert raised.value.code == "METER_FAILURE"
    assert [ord(char) for char in str(raised.value)] == [0xD83D, 0xDE00]

    with pytest.raises(UmfCoreError) as raised:
        validate_document(document, is_cancelled=lambda: (_ for _ in ()).throw(RuntimeError(explicit_pair)))
    assert raised.value.code == "CANCELLATION_CAPABILITY"
    assert [ord(char) for char in str(raised.value)] == [0xD83D, 0xDE00]

    with pytest.raises(UmfCoreError) as raised:
        validate_document(document, now=lambda: (_ for _ in ()).throw(RuntimeError(explicit_pair)), deadline_ms=100)
    assert raised.value.code == "CLOCK_CAPABILITY"
    assert [ord(char) for char in str(raised.value)] == [0xD83D, 0xDE00]

    reentered = False

    def reenter(_amount):
        nonlocal reentered
        if not reentered:
            reentered = True
            validate_document(document)

    validate_document(document, meter=reenter)
    assert reentered


def test_host_admission_preserves_aggregate_text_without_a_hidden_ceiling():
    from umf._rust import _wire, copy_json

    value = _wire({"a": "ab", "b": "cd"})
    assert value["kind"] == "object"
    assert len(value["members"]) == 2
    large = "x" * 4_000_001
    copied = copy_json(large)
    assert len(copied) == len(large)

    from umf.schemas import schema_validator
    assert schema_validator({"type": "string"}).is_valid(large)


def test_native_error_envelope_reconstructs_raw_utf16_without_replacement():
    import json

    from umf._rust import _raise_native

    envelope = json.dumps({
        "profile": "umf.core-wire/1",
        "status": "error",
        "code": "CALLBACK_ERROR",
        "pathUnits": [47, 0xD800],
        "messageUnits": [0xDC00, 0x61],
    })
    with pytest.raises(UmfCoreError) as raised:
        _raise_native(ValueError(envelope))
    assert raised.value.code == "CALLBACK_ERROR"
    assert [ord(unit) for unit in raised.value.path] == [47, 0xD800]
    assert [ord(unit) for unit in str(raised.value)] == [0xDC00, 0x61]


def _callback_document():
    return {
        "extensions": {"example.baseline-callback": {"kind": "sentinel", "nested": {"stable": True}}},
        "id": "callback-document",
        "modules": [{"elements": [], "id": "m", "namespace": "urn:baseline"}],
        "umf": "0.10.0",
        "vocabularies": {"example.baseline-callback": {"version": "1.0.0"}},
    }


def test_installed_callback_diagnostic_preserves_raw_surrogate_path_and_message():
    from umf import Diagnostic, Extension, Registry, validate_document

    registry = Registry()
    registry.register(Extension(
        "example.baseline-callback", "1.0.0", ("document",), True,
        lambda _payload, _context: [
            Diagnostic("HOST_CALLBACK\ud800", "/x\ud800", "bad\udfff"),
            Diagnostic("HOST-É", "/unicode", "unicode code"),
            Diagnostic("HOST_MARKER", "/~p00d83d00de00", "marker-shaped host path"),
        ],
    ))
    result = validate_document(_callback_document(), registry)
    diagnostic = next(item for item in result.diagnostics if item.code.startswith("HOST_CALLBACK"))
    assert [ord(unit) for unit in diagnostic.code] == [ord(unit) for unit in "HOST_CALLBACK"] + [0xD800]
    assert [ord(unit) for unit in diagnostic.path] == [47, 120, 0xD800]
    assert [ord(unit) for unit in diagnostic.message] == [98, 97, 100, 0xDFFF]
    assert any(item.code == "HOST-É" for item in result.diagnostics)
    assert next(item for item in result.diagnostics if item.code == "HOST_MARKER").path == "/~p00d83d00de00"


def test_installed_callback_fields_preserve_explicit_pair_origin_distinct_from_astral():
    from umf import Diagnostic, Extension, Registry, validate_document

    explicit_pair = "\ud83d\ude00"
    astral = "😀"
    registry = Registry()
    registry.register(Extension(
        "example.baseline-callback", "1.0.0", ("document",), True,
        lambda _payload, _context: [
            Diagnostic(f"PAIR{explicit_pair}", f"/{explicit_pair}", f"pair:{explicit_pair}"),
            Diagnostic(f"ASTRAL{astral}", f"/{astral}", f"astral:{astral}"),
        ],
    ))
    result = validate_document(_callback_document(), registry)
    pair = next(item for item in result.diagnostics if item.code.startswith("PAIR"))
    astral_item = next(item for item in result.diagnostics if item.code.startswith("ASTRAL"))
    assert [ord(char) for char in pair.code] == [*map(ord, "PAIR"), 0xD83D, 0xDE00]
    assert [ord(char) for char in pair.path] == [47, 0xD83D, 0xDE00]
    assert [ord(char) for char in pair.message] == [*map(ord, "pair:"), 0xD83D, 0xDE00]
    assert [ord(char) for char in astral_item.code] == [*map(ord, "ASTRAL"), 0x1F600]
    assert [ord(char) for char in astral_item.path] == [47, 0x1F600]
    assert [ord(char) for char in astral_item.message] == [*map(ord, "astral:"), 0x1F600]


def test_installed_callback_receives_original_python_document_and_payload():
    from umf import Extension, Registry, validate_document

    explicit_pair = "\ud83d\ude00"
    document = _callback_document()
    document["id"] = explicit_pair
    document["extensions"]["example.baseline-callback"] = {"label": explicit_pair}
    observed = []

    def callback(payload, context):
        observed.append((payload["label"], context["document"]["id"]))
        return []

    registry = Registry()
    registry.register(Extension("example.baseline-callback", "1.0.0", ("document",), True, callback))
    result = validate_document(document, registry)
    assert result.complete
    assert len(observed) == 1
    assert tuple([ord(char) for char in text] for text in observed[0]) == (
        [0xD83D, 0xDE00],
        [0xD83D, 0xDE00],
    )


def test_extension_schema_diagnostic_preserves_explicit_surrogate_pair_path():
    from umf import Extension, Registry, validate_document

    explicit_pair = "\ud83d\ude00"
    document = _callback_document()
    document["extensions"]["example.baseline-callback"] = {explicit_pair: "wrong type"}
    registry = Registry()
    registry.register(Extension(
        "example.baseline-callback", "1.0.0", ("document",),
        {"type": "object", "properties": {explicit_pair: {"type": "integer"}}},
    ))
    result = validate_document(document, registry)
    diagnostic = next(item for item in result.diagnostics if item.code == "EXTENSION_STRUCTURE")
    assert diagnostic.path == f"/extensions/example.baseline-callback/{explicit_pair}"
    assert "~p" not in diagnostic.path


def test_installed_callback_exception_preserves_raw_surrogate_message():
    from umf import Extension, Registry, validate_document

    registry = Registry()

    def fail(_payload, _context):
        raise ValueError("callback\ud83d\ude00failed")

    registry.register(Extension("example.baseline-callback", "1.0.0", ("document",), True, fail))
    result = validate_document(_callback_document(), registry)
    failure = next(item for item in result.diagnostics if item.code == "VALIDATOR_FAILURE")
    assert [ord(unit) for unit in failure.message if 0xD800 <= ord(unit) <= 0xDFFF] == [0xD83D, 0xDE00]


def test_constraint_only_compatibility_entrypoint_skips_structural_admission():
    from umf._rust import run_core_constraints

    assert run_core_constraints({}, program={"profile": "umf.constraints/1", "steps": []}) == ()
