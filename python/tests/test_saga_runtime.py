# SPDX-License-Identifier: MIT OR Apache-2.0
import json
from pathlib import Path
import pytest
from umf import SagaRuntime
from umf.rust_codegen import UmfCodegenError
ROOT=Path(__file__).resolve().parents[2]
FIXTURE=json.loads((ROOT/"docs/helix/03-test/fixtures/saga/supported-action.json").read_text(encoding="utf-8"))
OPAQUE=json.loads((ROOT/"docs/helix/02-design/examples/saga/allocation.json").read_text(encoding="utf-8"))
def test_installed_saga_runtime_declares_inspects_edits_assesses_and_refuses_opaque_source():
 runtime=SagaRuntime();source=json.loads(json.dumps(FIXTURE))
 before=runtime.inspect_sagas(source)
 assert before["validation"]["valid"] is True
 assert not any(item["kind"]=="unknown" for entry in before["entries"] for item in entry["obligations"])
 definition=json.loads(json.dumps(source["modules"][0]["extensions"]["umf.actions.saga"]["sagas"][0]));definition["id"]="set-active-saga-copy"
 declared=runtime.declare_saga(source,"sales",definition);inspection=runtime.inspect_sagas(declared)
 assert any(entry["definition"]["id"]==definition["id"] for entry in inspection["entries"])
 identity={"module":"sales","saga":definition["id"]};replacement=json.loads(json.dumps(definition));replacement["description"]="Reviewed supported Action declaration"
 edited=runtime.edit_saga(declared,identity,replacement)
 assessment=runtime.assess_saga(edited,identity,{"id":"public-fixture","version":"1","coreVersion":"0.10.0","sagaVersion":"0.1.0","coordination":"unknown","claims":[],"source":edited,"identity":identity})
 assert next(entry for entry in runtime.inspect_sagas(edited)["entries"] if entry["definition"]["id"]==identity["saga"])["definition"]["description"]=="Reviewed supported Action declaration"
 assert assessment["executionVerified"] is False
 opaque=OPAQUE["modules"][0]["extensions"]["umf.actions.saga"]["sagas"][0].copy();opaque["id"]="opaque-copy"
 with pytest.raises(UmfCodegenError) as failure:runtime.declare_saga(OPAQUE,"equipment",opaque)
 assert failure.value.code=="SAGA_UNKNOWN"
 with pytest.raises(UmfCodegenError) as failure:runtime.declare_saga(source,"sales",{})
 assert failure.value.code=="SAGA_STRUCTURE"
