# SPDX-License-Identifier: MIT OR Apache-2.0
import json
from pathlib import Path

import pytest
from umf import rust_csv_boolean_lexical
from umf._rust import UmfCoreError

SOURCE = json.loads(
    (Path(__file__).parents[2] / "spec/domain-packs/medical/ontology.json").read_text()
)
REQUEST = {
    "profile": "umf.csv-boolean-lexical/1.0.0",
    "field": {"module": "domain", "element": "patients.active"},
    "token": "True",
    "sourceContext": {"source": "original.csv", "row": 1, "unknown": ["雪", None]},
}


def test_opt_in_python_surface_validates_and_verifies_csv_boolean_receipt():
    assert rust_csv_boolean_lexical.profile_version() == "umf-csv-boolean-lexical/0.1.0"
    receipt = rust_csv_boolean_lexical.validate(SOURCE, REQUEST)
    assert receipt["value"]["boolean"] is True
    assert receipt["source"] == SOURCE
    assert receipt["request"] == REQUEST
    assert receipt["provenance"] == "unverified"
    assert rust_csv_boolean_lexical.verify(receipt, SOURCE, REQUEST) == receipt


@pytest.mark.parametrize(
    ("controls", "code"),
    [({"max_work": 0}, "RESOURCE_LIMIT"), ({"timeout_ms": 0}, "DEADLINE")],
)
def test_python_surface_preserves_work_and_deadline_controls(controls, code):
    with pytest.raises(UmfCoreError) as raised:
        rust_csv_boolean_lexical.validate(SOURCE, REQUEST, **controls)
    assert raised.value.code == code


@pytest.mark.parametrize(
    ("name", "value"),
    [("max_work", True), ("max_work", -1), ("timeout_ms", 1.5), ("timeout_ms", -1)],
)
def test_python_surface_rejects_invalid_controls_before_native_dispatch(name, value):
    with pytest.raises(TypeError):
        rust_csv_boolean_lexical.validate(SOURCE, REQUEST, **{name: value})


def test_python_surface_rejects_forged_receipt():
    with pytest.raises(UmfCoreError):
        rust_csv_boolean_lexical.verify({"operation": "forged"}, SOURCE, REQUEST)
