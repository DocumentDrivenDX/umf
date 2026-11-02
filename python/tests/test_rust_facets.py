# SPDX-License-Identifier: MIT OR Apache-2.0
import json

import pytest
from umf import rust_facets
from umf._rust import UmfCoreError, _rust_core, _wire
from umf.generated_resources import generated_resource

SOURCE = {
    "umf": "0.10.0",
    "id": "python-facets",
    "vocabularies": {"future": {"version": "1.0.0"}},
    "extensions": {"future": {"opaque": "retain"}},
    "modules": [{
        "id": "m",
        "namespace": "",
        "elements": [{
            "id": "f",
            "kind": "field",
            "scalarType": "integer",
            "extensions": {"future": {"unknown": [None, "retain"]}},
            "facets": {
                "integerWidth": {
                    "bits": 8,
                    "signed": True,
                    "futureQualifier": "retain",
                },
                "futureGroup": {"keep": [1, 2]},
            },
        }],
    }],
}
IDENTITY = {"module": "m", "element": "f"}


def test_opt_in_python_binding_runs_the_four_public_facet_operations():
    assert rust_facets.profile_version() == "umf-core-facets/0.1.0"
    receipt = rust_facets.declare(
        SOURCE, IDENTITY, {"integerWidth": {"bits": 16, "signed": False}}
    )
    assert receipt["operation"] == "declare-core-facets"
    assert receipt["request"] == {"integerWidth": {"bits": 16, "signed": False}}
    assert receipt["source"] == SOURCE
    facets = receipt["target"]["modules"][0]["elements"][0]["facets"]
    assert facets["integerWidth"]["futureQualifier"] == "retain"
    assert facets["futureGroup"] == {"keep": [1, 2]}
    inspected = rust_facets.inspect(receipt["target"], IDENTITY)
    assert inspected["meaning"]["interpreted"]["integerWidth"] == {
        "bits": 16,
        "signed": False,
    }
    assert rust_facets.verify(receipt, receipt["target"]) == receipt
    assert rust_facets.historical_patch(inspected["meaning"]["interpreted"]) == {
        "integerWidth": {"bits": 16, "signed": False}
    }


@pytest.mark.parametrize(
    ("controls", "code"),
    [({"max_work": 0}, "RESOURCE_LIMIT"), ({"timeout_ms": 0}, "DEADLINE")],
)
def test_python_binding_keeps_work_and_deadline_controls_separate(controls, code):
    with pytest.raises(UmfCoreError) as raised:
        rust_facets.inspect(SOURCE, IDENTITY, **controls)
    assert raised.value.code == code


@pytest.mark.parametrize(
    ("name", "value"),
    [("max_work", True), ("max_work", -1), ("timeout_ms", 1.5), ("timeout_ms", -1)],
)
def test_python_binding_rejects_invalid_controls_before_native_dispatch(name, value):
    with pytest.raises(TypeError):
        rust_facets.inspect(SOURCE, IDENTITY, **{name: value})


def test_native_opt_in_binding_rejects_internal_facade_phase_operations():
    resources = {
        name: generated_resource(resource_name)
        for name, resource_name in {
            "coreSchema": "schema",
            "referenceSchema": "semantic_reference",
            "packageSchema": "package_schema",
            "constraints": "constraints",
            "domainPolicy": "domain_policy",
        }.items()
    }
    request = {"op": "model/admitCoreFacetRequest", "resources": resources, "request": {}}
    wire = json.dumps(_wire(request), ensure_ascii=True, separators=(",", ":"))
    response = json.loads(_rust_core.execute_core_facets_wire(wire))
    assert response["status"] == "error"
    assert response["code"] == "REQUEST"
