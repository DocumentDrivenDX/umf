# SPDX-License-Identifier: MIT OR Apache-2.0
import json
from copy import deepcopy
from pathlib import Path

from umf import rust_avro_document_inspect


def _tagged_string(value):
    return {"kind": "string", "value": value}


def _tagged_object(**values):
    return {"kind": "object", "members": {key: value for key, value in values.items()}}


def test_document_inspector_profile_and_incomplete_native_result():
    document = _tagged_object(umf=_tagged_string("0.10.0"))
    result = rust_avro_document_inspect.inspect(document)
    assert rust_avro_document_inspect.profile_version() == "umf-r5-avro-document-inspect/0.1.0"
    assert result["profile"] == rust_avro_document_inspect.profile_version()
    assert "admission" in result
    assert result["nativeInspection"]["status"] == "not-run"


def test_document_inspector_forwards_meter_and_resource_limits():
    calls = []
    document = _tagged_object(umf=_tagged_string("0.10.0"))
    rust_avro_document_inspect.inspect(document, meter=calls.append)
    assert calls and sum(calls) > 0
    try:
        rust_avro_document_inspect.inspect(document, max_work=0)
    except Exception as error:
        assert getattr(error, "code", None) == "RESOURCE_LIMIT"
    else:
        raise AssertionError("expected resource limit")


def test_document_inspector_runs_native_profile_for_admitted_fixture():
    fixture = json.loads((Path(__file__).parents[2] / "fixtures/avro/candidate-edits.json").read_text())
    document = fixture["cases"][0]["result"]["source"]
    before = deepcopy(document)
    result = rust_avro_document_inspect.inspect(document)
    assert result["admission"]["valid"] is True
    assert result["nativeInspection"]["status"] == "inspected"
    assert result["nativeInspection"]["complete"] is False
    assert document == before
    assert document["vocabularies"]["example.future"] == {"version": "7.0.0"}
