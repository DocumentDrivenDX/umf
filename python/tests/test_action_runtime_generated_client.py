# SPDX-License-Identifier: MIT OR Apache-2.0
"""End-to-end bridge tests from the unchanged generated synchronous client."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from umf.action_runtime import (
    admit_generated_action_invocation,
    admit_generated_record_values,
    create_action_engine,
    prepare_single_set_action,
)
from umf.rust_codegen import UmfCodegenError


def _fixture_root() -> Path:
    return Path(__file__).resolve().parents[2] / "fixtures/actions-binding"


def _read_fixture() -> tuple[bytes, dict]:
    directory = _fixture_root()
    return (
        (directory / "source.json").read_bytes(),
        json.loads((directory / "vectors.json").read_text(encoding="utf-8")),
    )


def _generated_requests(engine, source: bytes, tmp_path: Path) -> list[dict]:
    generated = engine.generate_python_client(
        {"text": source.decode("utf-8", errors="strict"), "package": "actions_binding"}
    )
    for item in generated["files"]:
        destination = tmp_path / item["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(item["text"], encoding="utf-8")
    program = """\
import json, sys
sys.path.insert(0, sys.argv[1])
from actions_binding import ItemKey, SyncActions, SyncClient
class Capture:
    def __init__(self): self.requests = []
    def execute(self, request):
        self.requests.append(request)
        if request['kind'] == 'validate':
            return {'schema': request['schema'], 'valid': True}
        return {'schema': request['schema'], 'created': [], 'changed': [],
                'counts': {}, 'consistency_token': 'fixture-token'}
capture = Capture()
actions = SyncActions(SyncClient(capture))
key = ItemKey(item_id='item-1')
actions.set_label(item=key, label_value='ready', idempotency_key='fixture-key')
actions.set_label_validate(item=key, label_value='ready')
print(json.dumps(capture.requests, ensure_ascii=False, separators=(',', ':')))
"""
    result = subprocess.run(
        [sys.executable, "-I", "-S", "-c", program, str(tmp_path)],
        check=False,
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
    )
    assert result.returncode == 0, result.stderr
    assert result.stderr == ""
    return json.loads(result.stdout)


def _base_request(source: bytes, vectors: dict) -> dict:
    return {
        "source": {
            "mediaType": "application/json",
            "utf8": source.decode("utf-8", errors="strict"),
            "sha256": vectors["source"]["sha256"],
        },
        "model": vectors["model"],
        "action": vectors["actionPin"],
        "authorization": vectors["authorization"],
    }


def _expected_preparation(source: bytes, vectors: dict) -> dict:
    assert hashlib.sha256(source).hexdigest() == vectors["source"]["sha256"]
    expected = dict(vectors["expected"]["prepared"])
    expected["source"] = {
        "mediaType": "application/json",
        "utf8": source.decode("utf-8", errors="strict"),
        "sha256": vectors["source"]["sha256"],
    }
    return expected


def _assert_oracle_vectors(vectors: dict) -> None:
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
    model = vectors["model"]
    action = vectors["actionPin"]
    logical_inputs = oracle["admittedActionInputs"]
    canonical = json.dumps(
        {"model": model, "action": action, "inputs": logical_inputs},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    digest = hashlib.sha256(
        b"umf.actions.generated-invocation/1\n" + canonical
    ).hexdigest()
    assert digest == vectors["inputSha256"]["sha256"]
    assert digest == expected["invocation"]["inputSha256"]


def test_generated_apply_validate_and_record_share_native_admission(tmp_path):
    source, vectors = _read_fixture()
    _assert_oracle_vectors(vectors)
    engine = create_action_engine()

    generated_requests = _generated_requests(engine, source, tmp_path)

    assert generated_requests == [
        vectors["generatedRequests"]["apply"],
        vectors["generatedRequests"]["validate"],
    ]
    preparation_request = _base_request(source, vectors)
    prepared = prepare_single_set_action(engine, preparation_request)
    expected_prepared = _expected_preparation(source, vectors)
    assert prepared == expected_prepared
    assert prepared["source"] == preparation_request["source"]
    assert prepared["model"] == vectors["model"]
    assert prepared["action"] == vectors["actionPin"]

    expected_invocation = {
        **vectors["expected"]["invocation"],
        "preparation": expected_prepared,
    }
    results = []
    for invocation in generated_requests:
        result = admit_generated_action_invocation(
            engine, {**preparation_request, "invocation": invocation}
        )
        assert result == expected_invocation
        results.append(result)
    assert results[0] == results[1]

    record_request = {
        "source": preparation_request["source"],
        "model": preparation_request["model"],
        "record": {"module": "catalog", "element": "item"},
        "values": {"item_id": "item-1", "label": "ready"},
    }
    row = admit_generated_record_values(engine, record_request)
    expected_record = {
        **vectors["expected"]["recordValues"],
        "source": record_request["source"],
        "model": record_request["model"],
    }
    assert row == expected_record
    assert row["source"] == preparation_request["source"]
    assert row["model"] == vectors["model"]


def test_generated_validate_rejects_even_null_idempotency_member(tmp_path):
    source, vectors = _read_fixture()
    engine = create_action_engine()
    generated = _generated_requests(engine, source, tmp_path)[1]
    assert "idempotency_key" not in generated
    malformed = {**generated, "idempotency_key": None}
    request = {
        **_base_request(source, vectors),
        "invocation": malformed,
    }

    with pytest.raises(UmfCodegenError) as failure:
        admit_generated_action_invocation(engine, request)

    assert getattr(failure.value, "code", None) == "ACTION_RUNTIME_INVALID"


def test_generated_value_outside_constraint_has_no_admission_result(tmp_path):
    source, vectors = _read_fixture()
    engine = create_action_engine()
    apply = _generated_requests(engine, source, tmp_path)[0]
    invalid = {
        **apply,
        "inputs": {"item": {"item_id": "item-1"}, "label_value": "pending"},
    }

    with pytest.raises(UmfCodegenError):
        admit_generated_action_invocation(
            engine,
            {**_base_request(source, vectors), "invocation": invalid},
        )
