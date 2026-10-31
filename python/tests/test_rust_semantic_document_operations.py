# SPDX-License-Identifier: MIT OR Apache-2.0

import json
from pathlib import Path

import pytest
from umf import (
    declare_core_semantic_types,
    get_core_semantic_types,
    get_semantic_types,
    inspect_core_semantic_types,
    set_semantic_types,
    verify_core_semantic_type_declaration,
)
from umf._rust import UmfCoreError

ROOT = Path(__file__).resolve().parents[2]


def _packet(relative):
    return json.loads((ROOT / relative).read_text())


def test_core_semantic_reference_operations_match_frozen_predecessor():
    frozen = _packet("tests/rust-core/fixtures/r5-core-semantic-types/frozen-typescript.json")
    source = frozen["cases"]["inspect"]["value"]["source"]
    identity = frozen["cases"]["inspect"]["value"]["identity"]
    assert inspect_core_semantic_types(source, identity) == frozen["cases"]["inspect"]["value"]
    copied_types = get_core_semantic_types(source, identity)
    assert copied_types == frozen["cases"]["get"]["value"]
    copied_types[0]["term"] = "mutated"
    assert source["modules"][0]["elements"][0]["semanticTypes"][0]["term"] == "email"

    declaration_case = frozen["cases"]["declare"]["value"]
    declaration = declare_core_semantic_types(
        declaration_case["source"],
        declaration_case["identity"],
        declaration_case["request"]["types"],
    )
    assert declaration == declaration_case
    assert verify_core_semantic_type_declaration(declaration, declaration["target"]) == declaration


def test_interim_accessors_copy_and_preserve_unknown_content():
    frozen = _packet("tests/rust-core/fixtures/r5-semantic-type-accessors/frozen-typescript.json")
    inputs = frozen["caseInputs"]
    document = inputs["document"]
    annotation = get_semantic_types(document, "m", "e")
    assert annotation == frozen["outcomes"]["get_copy_success"]["value"]["again"]
    before = json.loads(json.dumps(document))
    changed = set_semantic_types(document, "m", "e", annotation)
    assert document == before
    expected = frozen["outcomes"]["set_copy_on_write"]["value"]
    updated_annotation = expected["result"]
    changed = set_semantic_types(document, "m", "e", updated_annotation)
    assert changed["modules"][0]["elements"][0]["extensions"]["umf.semantic-types"] == updated_annotation
    assert changed["modules"][0]["elements"][0]["extensions"]["future"] == expected["unknownExtension"]


def test_invalid_python_values_and_controls_are_rust_owned():
    cycle = []
    cycle.append(cycle)
    with pytest.raises(UmfCoreError) as cycle_error:
        inspect_core_semantic_types(cycle, {"module": "m", "element": "e"})
    assert cycle_error.value.code == "LIMIT"

    with pytest.raises(UmfCoreError) as number_error:
        inspect_core_semantic_types({"number": float("nan")}, {"module": "m", "element": "e"})
    assert number_error.value.code in {"NON_JSON", "INVALID_NUMBER", "NUMBER"}

    class Hostile(dict):
        def __iter__(self):
            raise AssertionError("zero-work preflight must happen before host traversal")

    with pytest.raises(UmfCoreError) as limit_error:
        inspect_core_semantic_types(Hostile(), {}, max_work=0)
    assert limit_error.value.code == "RESOURCE_LIMIT"


def test_verify_receipt_refusal_precedes_current_host_admission():
    with pytest.raises(UmfCoreError) as error:
        verify_core_semantic_type_declaration(None, object())
    assert error.value.code == "SEMANTIC_TYPE_RECEIPT"


def test_declaration_and_accessor_stage_predecessor_arguments():
    with pytest.raises(UmfCoreError) as types_error:
        declare_core_semantic_types(object(), object(), [])
    assert types_error.value.code == "SEMANTIC_TYPE_STRUCTURE"

    document = {
        "umf": "0.10.0",
        "id": "semantic-accessors",
        "vocabularies": {"umf.semantic-types": {"version": "0.1.0"}},
        "modules": [{"id": "m", "namespace": "https://example.test", "elements": [{"id": "e", "extensions": {}}]}],
    }
    with pytest.raises(UmfCoreError) as target_error:
        set_semantic_types(document, "m", "missing", object())
    assert target_error.value.code == "SEMANTIC_TYPE_PROFILE"

    wrong_profile = {**document, "vocabularies": {"umf.semantic-types": {"version": "2.0.0"}}}
    with pytest.raises(UmfCoreError) as profile_error:
        set_semantic_types(wrong_profile, "missing", "missing", object())
    assert profile_error.value.code == "SEMANTIC_TYPE_PROFILE"
    assert str(profile_error.value) == "Cannot overwrite a different semantic type profile"


def test_null_vocabulary_accessor_mismatch_remains_explicit():
    document = {
        "umf": "0.10.0",
        "id": "semantic-accessors",
        "vocabularies": None,
        "modules": [{"id": "m", "namespace": "https://example.test", "elements": [{"id": "e", "extensions": {}}]}],
    }
    with pytest.raises(UmfCoreError):
        set_semantic_types(document, "m", "e", {"types": [{"vocabulary": "example.contact", "version": "1.0.0", "term": "email"}]})
