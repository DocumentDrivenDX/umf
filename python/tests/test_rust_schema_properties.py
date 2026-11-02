# SPDX-License-Identifier: MIT OR Apache-2.0
import copy
import json
from pathlib import Path

import pytest
from umf import rust_schema_properties
from umf._rust import UmfCoreError

ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((ROOT / "fixtures/metamodel/current-conformance.json").read_text())["cases"]
SOURCE = copy.deepcopy(next(case["document"] for case in CASES if case["id"] == "schema-properties/valid"))
IDENTITY = {"module": "m", "element": "quantity"}


def test_opt_in_python_binding_runs_all_four_schema_properties_operations():
    assert rust_schema_properties.profile_version() == "umf-core-schema-properties/0.1.0"
    inspected = rust_schema_properties.inspect(SOURCE, {"scope": "element", **IDENTITY})
    assert inspected["properties"]["default"]["value"] == {"integerToken": "1"}

    declared = rust_schema_properties.declare(
        SOURCE, {"scope": "element", **IDENTITY}, {"title": "Ordered quantity"}
    )
    assert declared["modules"][0]["elements"][0]["title"] == "Ordered quantity"
    validation = rust_schema_properties.validate(SOURCE, IDENTITY, {"integerToken": "2"})
    assert validation["valid"] is True
    resolved = rust_schema_properties.resolve_default(SOURCE, IDENTITY, {"state": "missing"})
    assert resolved["result"] == {"state": "present", "value": {"integerToken": "1"}}


@pytest.mark.parametrize(
    ("controls", "code"),
    [({"max_work": 0}, "RESOURCE_LIMIT"), ({"timeout_ms": 0}, "DEADLINE")],
)
def test_schema_properties_python_binding_keeps_work_and_deadline_controls(controls, code):
    with pytest.raises(UmfCoreError) as raised:
        rust_schema_properties.inspect(SOURCE, {"scope": "element", **IDENTITY}, **controls)
    assert raised.value.code == code


@pytest.mark.parametrize(
    ("name", "value"),
    [("max_work", True), ("max_work", -1), ("timeout_ms", 1.5), ("timeout_ms", -1)],
)
def test_schema_properties_python_binding_rejects_invalid_controls(name, value):
    with pytest.raises(TypeError):
        rust_schema_properties.inspect(
            SOURCE, {"scope": "element", **IDENTITY}, **{name: value}
        )
