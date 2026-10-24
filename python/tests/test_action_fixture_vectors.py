# SPDX-License-Identifier: MIT OR Apache-2.0
"""Golden source, generated transport and canonical tuple vector integrity."""

from __future__ import annotations

import hashlib
import json
import unicodedata
from pathlib import Path


def _fixture() -> tuple[bytes, dict]:
    candidates = [
        parent / "fixtures/actions-binding"
        for parent in Path(__file__).resolve().parents
    ]
    root = next((candidate for candidate in candidates if candidate.is_dir()), None)
    if root is None:
        raise AssertionError("neutral action-binding vectors are unavailable")
    source = (root / "source.json").read_bytes()
    vectors = json.loads((root / "vectors.json").read_text(encoding="utf-8"))
    return source, vectors


def test_source_bytes_and_fixture_identity_match_vectors():
    source, vectors = _fixture()

    assert len(source) == vectors["source"]["bytes"]
    assert hashlib.sha256(source).hexdigest() == vectors["source"]["sha256"]
    assert json.loads(source)["modules"][0]["id"] == vectors["identity"]["module"]
    assert vectors["identity"] == {
        "module": "catalog",
        "record": "item",
        "key": "item-key",
        "keyField": "item_id",
        "valueField": "label",
        "action": "set_label",
        "wireAction": "catalog.set_label",
        "entityParameter": "item",
        "valueParameter": "label_value",
        "writeFrame": "write_item",
    }


def test_key_tuple_and_generated_input_digest_match_fixed_vectors():
    _source, vectors = _fixture()
    tuple_vector = vectors["keyTuple"]
    assert tuple_vector["profile"] == "umf-key-tuple-v1"
    assert tuple_vector["tupleHex"] == "554d464b310104066974656d2d31"

    canonical = json.dumps(
        {
            "model": vectors["model"],
            "action": vectors["actionPin"],
            "inputs": vectors["logicalInputs"],
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    digest = hashlib.sha256(
        b"umf.actions.generated-invocation/1\n" + canonical
    ).hexdigest()
    assert digest == vectors["inputSha256"]["sha256"]


def test_generated_apply_and_validate_vectors_are_genuine_distinct_envelopes():
    _source, vectors = _fixture()
    generated = vectors["generatedRequests"]
    apply = generated["apply"]
    validate = generated["validate"]
    assert set(apply) == {
        "contract",
        "schema",
        "kind",
        "action",
        "inputs",
        "idempotency_key",
    }
    assert set(validate) == {"contract", "schema", "kind", "action", "inputs"}
    assert apply["kind"] == "apply"
    assert validate["kind"] == "validate"
    assert apply["idempotency_key"] == "fixture-key"
    assert apply["inputs"] == validate["inputs"]
    assert apply["action"] == validate["action"] == "catalog.set_label"
    assert apply["schema"] == validate["schema"] == vectors["source"]["sha256"]


def test_complete_bridge_expectations_are_anchored_to_existing_typescript_oracles():
    _source, vectors = _fixture()
    oracle = vectors["oracle"]
    expected = vectors["expected"]

    assert oracle["sourceInspection"]["valid"] is True
    assert oracle["sourceInspection"]["complete"] is False
    assert (
        oracle["sourceInspection"]["obligations"] == expected["prepared"]["obligations"]
    )
    assert oracle["admittedActionInputs"] == expected["invocation"]["inputs"]
    assert (
        oracle["keyTuple"]["tupleHex"] == expected["invocation"]["entity"]["tupleHex"]
    )
    assert oracle["fieldValues"] == {
        "item_id": {"valid": True, "complete": True, "diagnostics": []},
        "label": {"valid": True, "complete": True, "diagnostics": []},
    }
    assert [field["validation"] for field in oracle["recordValueCheck"]["fields"]] == [
        oracle["fieldValues"]["item_id"],
        oracle["fieldValues"]["label"],
    ]
    required_kinds = {
        "authorization",
        "attribution",
        "atomicity",
        "idempotency",
        "result",
    }
    required = [
        item["id"]
        for item in oracle["sourceInspection"]["obligations"]
        if item["kind"] in required_kinds
    ]
    assert expected["prepared"]["requiredExecutorObligations"] == required
    assert expected["prepared"]["executionVerified"] is False
    assert expected["invocation"]["executionVerified"] is False
    assert expected["recordValues"]["executionVerified"] is False

    canonical = json.dumps(
        {
            "model": vectors["model"],
            "action": vectors["actionPin"],
            "inputs": oracle["admittedActionInputs"],
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    digest = hashlib.sha256(
        b"umf.actions.generated-invocation/1\n" + canonical
    ).hexdigest()
    assert digest == vectors["inputSha256"]["sha256"]
    assert digest == expected["invocation"]["inputSha256"]


def test_string_vectors_preserve_exact_scalars_without_normalization():
    source, vectors = _fixture()
    field = json.loads(source)["modules"][0]["elements"][1]
    assert field["facets"]["length"] == {
        "min": 1,
        "max": 8,
        "unit": "unicode-scalar",
    }
    assert field["allowedValues"] == [
        {"string": "ready"},
        {"string": "held"},
        {"string": "abcdefgh"},
        {"string": "𐐷"},
    ]
    accepted = vectors["stringBoundaryValues"]["accepted"]
    assert len("𐐷") == 1
    assert len(accepted[2]) == 8
    normalization = vectors["stringBoundaryValues"]["normalizationDistinctExamples"]
    assert normalization["nfd"] != normalization["nfc"]
    assert unicodedata.normalize("NFC", normalization["nfd"]) == normalization["nfc"]
    assert normalization["distinct"] is True
    assert vectors["claims"]["executionVerified"] is False
    assert vectors["claims"]["planModel"] is False
