"""Focused REAL retained-owner optional-Saga controls; not public1M evidence.

The existing installed legacy Saga19 remains a separate required gate. These
private owner checks use the existing unbounded diagnostic allowance, not a new
cap or an alternative public support claim.
"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from umf import rust_codegen as codegen
from umf._rust import UmfCoreError, _rust_core

ROOT=Path(__file__).resolve().parents[2]
SAGA_SHA='4f42d73efe15041807f74031e12013c6df843d12556105a7aff357a0956a8940'
PINNED_TEST_SHA='b6af33945c4db2c43fc046060cf8e87e3e1803c6dcf17b6bd5e758b747d52944'


def resources():
    source=ROOT/'python/tests/test_retained_codegen_native.py'
    if hashlib.sha256(source.read_bytes()).hexdigest()!=PINNED_TEST_SHA:raise AssertionError('Approved native resource fixture helper changed')
    spec=importlib.util.spec_from_file_location('approved_retained_resources',source)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    result=module._resources()
    raw=(ROOT/'spec/extensions/saga/package.json').read_bytes()
    if hashlib.sha256(raw).hexdigest()!=SAGA_SHA:raise AssertionError('Genuine canonical optional Saga package differs')
    result['sagaPackage']=json.loads(raw)
    return result


def objects(value):
    if type(value)is dict:
        yield id(value)
        for child in value.values():yield from objects(child)
    elif type(value)is list:
        yield id(value)
        for child in value:yield from objects(child)


class PrivateRetainedSagaNativeTests(unittest.TestCase):
    def test_genuine_optional_saga_constructs_and_actual_retained_reports_match_original_oracle(self):
        supplied=resources();before=copy.deepcopy(supplied)
        returned=[];factory=_rust_core.create_codegen_resources
        def observed(*args,**kwargs):
            handle=factory(*args,**kwargs);returned.append(handle);return handle
        with patch.object(_rust_core,'create_codegen_resources',observed):
            engine=codegen.CodegenEngine(supplied,resource_mode='retained-native/1',max_work=None)
        self.assertEqual(len(returned),1)
        self.assertIs(engine._retained_resources,returned[0])
        self.assertEqual(supplied,before)
        corpus=json.loads((ROOT/'fixtures/saga/portable.json').read_text())
        vector=next(row for row in corpus['cases'] if row['id']=='ordered-baseline')
        original=copy.deepcopy(vector['source']);reports=[]
        for _ in range(2):
            # This is the real retained handle, not SagaRuntime/default dispatch.
            with patch.object(_rust_core,'execute_codegen_wire',side_effect=AssertionError('Legacy wire cannot substitute for retained owner operation')):
                result=engine.call('inspectSagas',{'source':vector['source']})
            self.assertIs(result['ok'],True);report=result['result']
            self.assertEqual(report['source'],original)
            self.assertFalse(set(objects(vector['source'])) & set(objects(report['source'])))
            reports.append(report)
        self.assertEqual(vector['source'],original)
        self.assertFalse(set(objects(reports[0]['source'])) & set(objects(reports[1]['source'])))
        # Apply the ORIGINAL independent oracle to both actual observations.
        # No native/SDK/browser producer is invoked by this oracle adapter.
        javascript="""
import {verifySagaVectors} from './scripts/saga-portable/verify.ts';
const data=await Bun.stdin.json();
const reports=data.reports;
const unexpected=()=>{throw Error('Unexpected operation in selected baseline oracle')};
const subject={inspectSagas:()=>{if(!reports.length)throw Error('Missing actual retained observation');return reports.shift()},declareSaga:unexpected,editSaga:unexpected,assessSaga:unexpected};
const result=verifySagaVectors(subject,[data.vector]);
if(result.cases!==1||result.passed!==1||reports.length!==0)throw Error(JSON.stringify(result));
console.log(JSON.stringify(result));
"""
        checked=subprocess.run(['bun','-e',javascript],cwd=ROOT,input=json.dumps({'vector':vector,'reports':reports}),text=True,capture_output=True,timeout=60)
        self.assertEqual(checked.returncode,0,checked.stderr+'\n'+checked.stdout)
        outcome=json.loads(checked.stdout);self.assertEqual((outcome['cases'],outcome['passed']),(1,1))
        print('retained-optional-saga-original-oracle '+json.dumps(outcome),flush=True)

    def test_malformed_optional_saga_refuses_eagerly_without_returning_native_handle(self):
        supplied=resources();supplied['sagaPackage']['schema']['type']=42
        original=copy.deepcopy(supplied);returned=[];factory=_rust_core.create_codegen_resources
        def observed(*args,**kwargs):
            handle=factory(*args,**kwargs)
            returned.append(handle)
            return handle
        with patch.object(_rust_core,'create_codegen_resources',observed):
            with self.assertRaises(UmfCoreError) as refused:
                codegen.CodegenEngine(supplied,resource_mode='retained-native/1',max_work=None)
        self.assertEqual(refused.exception.code,'SCHEMA_INVALID')
        self.assertEqual(returned,[],'No native handle may return from failed eager optional-package admission')
        self.assertEqual(supplied,original)


if __name__=='__main__':unittest.main()
