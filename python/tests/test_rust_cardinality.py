# SPDX-License-Identifier: MIT OR Apache-2.0
import pytest

from umf import rust_cardinality
from umf._rust import UmfCoreError


SOURCE = {
    "umf": "0.10.0",
    "id": "python-cardinality",
    "vocabularies": {},
    "modules": [{
        "id": "m",
        "namespace": "",
        "elements": [{
            "id": "f",
            "kind": "field",
            "extensions": {},
        }],
    }],
}
IDENTITY = {"module": "m", "element": "f"}


def test_opt_in_python_binding_runs_all_three_cardinality_operations():
    assert rust_cardinality.profile_version() == "umf-core-cardinality/0.1.0"
    inspected = rust_cardinality.inspect(SOURCE, IDENTITY)
    assert inspected["meaning"]["state"] == "missing"

    receipt = rust_cardinality.declare(
        SOURCE, IDENTITY, {"cardinality": "array"}
    )
    assert receipt["request"] == {"cardinality": "array"}
    verified = rust_cardinality.verify(receipt, receipt["target"])
    assert verified == receipt


@pytest.mark.parametrize(
    ("controls", "code"),
    [({"max_work": 0}, "RESOURCE_LIMIT"), ({"timeout_ms": 0}, "DEADLINE")],
)
def test_python_binding_keeps_work_and_deadline_controls_separate(controls, code):
    with pytest.raises(UmfCoreError) as raised:
        rust_cardinality.inspect(SOURCE, IDENTITY, **controls)
    assert raised.value.code == code


@pytest.mark.parametrize(
    ("name", "value"),
    [("max_work", True), ("max_work", -1), ("timeout_ms", 1.5), ("timeout_ms", -1)],
)
def test_python_binding_rejects_invalid_controls_before_native_dispatch(name, value):
    with pytest.raises(TypeError):
        rust_cardinality.inspect(SOURCE, IDENTITY, **{name: value})
