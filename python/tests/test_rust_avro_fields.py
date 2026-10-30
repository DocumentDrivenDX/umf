# SPDX-License-Identifier: MIT OR Apache-2.0
"""Host-binding differential checks against the frozen R5 source packet."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from umf import rust_avro_fields

PACKET = (
    Path(__file__).parents[2]
    / "tests/rust-core/fixtures/r5-avro-fields/predecessor.json"
)
CASES = json.loads(PACKET.read_text(encoding="utf-8"))["cases"]


def _input(case: dict[str, object]) -> tuple[dict[str, object], list[tuple[str, dict[str, object]]]]:
    payload = case["payload"]
    assert isinstance(payload, dict)
    dependencies = [
        (item["id"], item["root"])
        for item in payload.get("dependencies", [])
    ]
    return payload["root"], dependencies


def _error_code(error: ValueError) -> str:
    envelope = json.loads(str(error))
    assert envelope["profile"] == "umf.core-wire/1"
    assert envelope["status"] == "error"
    return envelope["code"]


def _assert_exact_tree(actual: object, expected: object) -> None:
    if isinstance(expected, dict):
        assert isinstance(actual, dict)
        assert list(actual) == list(expected)
        for key, expected_value in expected.items():
            _assert_exact_tree(actual[key], expected_value)
    elif isinstance(expected, list):
        assert isinstance(actual, list)
        assert len(actual) == len(expected)
        for actual_value, expected_value in zip(actual, expected):
            _assert_exact_tree(actual_value, expected_value)
    else:
        assert actual == expected


def _tagged_string(value: str) -> dict[str, object]:
    return {"kind": "string", "value": value}


def _tagged_object(members: dict[str, object], **extras: object) -> dict[str, object]:
    return {"kind": "object", "members": members, **extras}


def _surrogate_and_exact_number_tree() -> dict[str, object]:
    decimal_type = _tagged_object(
        {
            "type": _tagged_string("bytes"),
            "logicalType": _tagged_string("decimal"),
            "precision": {"kind": "number", "value": "1.00e0"},
            "scale": {"kind": "number", "value": "0"},
        }
    )
    field = _tagged_object(
        {"name": _tagged_string("field\ud800"), "type": decimal_type},
        futureRepresentationField={"keep": ["source", 7]},
    )
    return _tagged_object(
        {
            "type": _tagged_string("record"),
            "name": _tagged_string("R"),
            "fields": {"kind": "array", "items": [field]},
        }
    )


@pytest.mark.parametrize(
    "case",
    CASES,
    ids=lambda case: case["label"],
)
def test_frozen_100_case_packet(case: dict[str, object]) -> None:
    assert case["status"] == "ok"
    root, dependencies = _input(case)
    actual = rust_avro_fields.derive_fields(root, dependencies)
    _assert_exact_tree(actual, case["fields"])


def test_packet_replay_covers_all_frozen_cases_and_fields() -> None:
    assert len(CASES) == 100
    assert sum(len(case["fields"]) for case in CASES) == 294


def test_returned_native_field_is_an_isolated_tagged_copy() -> None:
    packet = json.loads(PACKET.read_text(encoding="utf-8"))
    case = packet["cases"][0]
    root, dependencies = _input(case)
    baseline = rust_avro_fields.derive_fields(root, dependencies)
    baseline[0]["nativeField"]["bindingMutation"] = True
    repeated = rust_avro_fields.derive_fields(root, dependencies)
    assert "bindingMutation" not in repeated[0]["nativeField"]
    assert "bindingMutation" not in root["members"]["fields"]["items"][0]


def test_tagged_copy_preserves_unknown_representation_surrogates_and_number_lexemes() -> None:
    root = _surrogate_and_exact_number_tree()
    result = rust_avro_fields.derive_fields(root)
    field = result[0]
    assert ord(field["element"]["name"][-1]) == 0xD800
    assert field["element"]["scalarType"] == "decimal"
    native = field["nativeField"]
    assert native["members"]["type"]["members"]["precision"]["value"] == "1.00e0"
    assert native["futureRepresentationField"] == {"keep": ["source", 7]}

    native["futureRepresentationField"]["keep"].append("mutated")
    repeated = rust_avro_fields.derive_fields(root)[0]["nativeField"]
    assert repeated["futureRepresentationField"] == {"keep": ["source", 7]}
    assert root["members"]["fields"]["items"][0]["futureRepresentationField"] == {
        "keep": ["source", 7]
    }


def test_cooperative_cancellation_is_forwarded_to_the_rust_context() -> None:
    packet = json.loads(PACKET.read_text(encoding="utf-8"))
    root, dependencies = _input(packet["cases"][0])
    with pytest.raises(ValueError) as raised:
        rust_avro_fields.derive_fields(root, dependencies, is_cancelled=lambda: True)
    assert _error_code(raised.value) == "CANCELLED"

    def broken_cancel() -> bool:
        raise RuntimeError("cancel check stopped")

    with pytest.raises(ValueError) as callback_error:
        rust_avro_fields.derive_fields(root, dependencies, is_cancelled=broken_cancel)
    assert _error_code(callback_error.value) == "CANCELLATION_CAPABILITY"


def test_huge_dependency_id_is_charged_before_utf16_materialization() -> None:
    primitive = _tagged_string("int")
    dependency_id = "x" * 100_000
    with pytest.raises(ValueError) as raised:
        rust_avro_fields.derive_fields(
            _tagged_string("null"),
            [(dependency_id, primitive)],
            max_work=100,
        )
    assert _error_code(raised.value) == "RESOURCE_LIMIT"


def test_huge_dependency_id_checks_cancellation_before_utf16_materialization() -> None:
    primitive = _tagged_string("int")
    dependency_id = "x" * 100_000
    large_id_charge_seen = False

    def meter(amount: int) -> None:
        nonlocal large_id_charge_seen
        if amount >= len(dependency_id):
            large_id_charge_seen = True

    with pytest.raises(ValueError) as raised:
        rust_avro_fields.derive_fields(
            _tagged_string("null"),
            [(dependency_id, primitive)],
            meter=meter,
            is_cancelled=lambda: large_id_charge_seen,
        )
    assert _error_code(raised.value) == "CANCELLED"
    assert large_id_charge_seen


def test_host_work_meter_and_callback_errors_preserve_native_error_codes() -> None:
    with pytest.raises(ValueError) as limited:
        rust_avro_fields.derive_fields(_tagged_string("null"), max_work=1)
    assert _error_code(limited.value) == "RESOURCE_LIMIT"

    def broken_meter(_amount: int) -> None:
        raise RuntimeError("meter stopped")

    with pytest.raises(ValueError) as meter_error:
        rust_avro_fields.derive_fields(_tagged_string("null"), meter=broken_meter)
    assert _error_code(meter_error.value) == "METER_FAILURE"

    with pytest.raises(ValueError) as first_refusal:
        rust_avro_fields.derive_fields(
            _tagged_string("null"), max_work=0, meter=broken_meter
        )
    assert _error_code(first_refusal.value) == "RESOURCE_LIMIT"


def test_deadline_controls_preserve_missing_elapsed_and_callback_errors() -> None:
    root = _tagged_string("null")
    with pytest.raises(ValueError, match="now is required with deadline_ms"):
        rust_avro_fields.derive_fields(root, deadline_ms=1)

    missing_clock_calls = 0

    def no_clock() -> None:
        nonlocal missing_clock_calls
        missing_clock_calls += 1

    with pytest.raises(ValueError) as missing_clock:
        rust_avro_fields.derive_fields(root, now=no_clock, deadline_ms=1)
    assert _error_code(missing_clock.value) == "CLOCK_CAPABILITY_REQUIRED"
    assert missing_clock_calls == 1

    with pytest.raises(ValueError) as elapsed:
        rust_avro_fields.derive_fields(root, now=lambda: 12, deadline_ms=11)
    assert _error_code(elapsed.value) == "DEADLINE"

    def broken_clock() -> int:
        raise RuntimeError("clock stopped")

    with pytest.raises(ValueError) as clock_error:
        rust_avro_fields.derive_fields(root, now=broken_clock, deadline_ms=11)
    assert _error_code(clock_error.value) == "CLOCK_CAPABILITY"


def test_malformed_tagged_carriers_and_dependency_pairs_are_rejected() -> None:
    with pytest.raises(ValueError) as malformed_tag:
        rust_avro_fields.derive_fields({"kind": "number", "value": 1})
    assert _error_code(malformed_tag.value) == "NATIVE_JSON_TREE"

    valid_tree = _tagged_string("null")
    with pytest.raises(ValueError, match="each dependency must be an exact"):
        rust_avro_fields.derive_fields(valid_tree, [["dependency", valid_tree]])
    with pytest.raises(ValueError, match="each dependency must be an exact"):
        rust_avro_fields.derive_fields(valid_tree, [(1, valid_tree)])


def test_profile_mismatch_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rust_avro_fields, "profile_version", lambda: "future-profile")
    with pytest.raises(RuntimeError, match="capability profile mismatch"):
        rust_avro_fields.derive_fields(_tagged_string("null"))
