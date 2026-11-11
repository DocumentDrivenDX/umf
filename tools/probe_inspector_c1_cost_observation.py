#!/usr/bin/env python3
"""One unchanged strict 1M same-wheel observation; never qualification."""
import argparse
import importlib.util
import json
from pathlib import Path

def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def original_baseline(failure):
    returned=failure['returnedWork'];attempted=failure['attemptedWork']
    refused=attempted-returned
    if (returned,attempted,refused)!=(999955,1000024,69):raise ValueError('C1 derived original callback baseline')
    return {'acceptedHostWork':returned,'attemptedHostWork':attempted,'refusedCharge':refused}

def run(args):
    intake=load(args.controller/'tools/intake_inspector_c1_cost_observation.py','c1_cost_intake')
    observer=load(args.controller/'tools/probe_inspector_installed_constructor_observation.py','c8_observer')
    pins=intake.fixture(args.controller);intake.identity(args,'before')
    try:
        import umf.rust_codegen as compiler
        import umf._rust_core as native
        c8=load(args.controller/'tools/intake_inspector_installed_observation.py','c8_phase_names')
        observer_pins={'bounds':pins['bounds'],'phaseNames':c8.fixture(args.controller)['phaseNames'],
          'baseline':original_baseline(pins['failure']),
          'nativeMember':pins['wheel']['nativeMember'],'stack':pins['stack']}
        stack=None;setup={'status':'disabled'}
        try:stack=observer.StackSnapshot.prepare(Path(native.__file__),observer_pins);setup={'status':'ready','elfSymbolParsing':'authenticated installed wheel bytes; no ELF execution'}
        except Exception as error:setup={'status':'unavailable','errorType':type(error).__name__}
        report=observer.observe_once(compiler,native,observer_pins,stack)
        report['baselineComparison']['refusalAmountComparison']='69 derived from the retained single-refusal prefix (1000024-999955); not a separately recorded denial counter'
        report.update(profile='umf.private-c1-cost-observation/1',runtimeSource=pins['runtimeSource'],runtimeTree=pins['runtimeTree'],
          observerController=args.controller_sha,observerRun=args.observer_run,observerAttempt=args.observer_attempt,
          parentRun=pins['parent']['id'],parentAttempt=pins['parent']['attempt'],parentJob=pins['parent']['jobID'],
          wheelSHA256=pins['wheel']['sha256'],nativeSHA256=pins['wheel']['nativeMember']['sha256'],
          currentInputIdentity=pins['producer']['currentInputIdentity'],originalFailure=pins['failure'],
          constructorCalls=report['counts']['constructorCalls'],strictMaximumWork=1000000,stackSetup=setup,
          exactPhasePath='Coarse callback amount/phase only. Raw phase strings bounded; root/site remains unknown.',
          publishable=False,readyForEnrollment=False)
        data=(json.dumps(report,indent=2,ensure_ascii=True)+'\n').encode()
        if len(data)>pins['bounds']['receiptBytes']:raise ValueError('C1 observation receipt size')
        with (args.out/'observation.json').open('xb') as f:f.write(data)
        return 0 if report['observerFailure'] is None and report['counts']['constructorCalls']==1 else 1
    finally:
        intake.identity(args,'after')
        pair={'profile':'umf.private-c1-cost-observation-identity-pair/1','runtimeSource':pins['runtimeSource'],
          'observerController':args.controller_sha,'observerRun':args.observer_run,'observerAttempt':args.observer_attempt,
          'beforeSHA256':intake.sha(args.out/'identity-before.json'),'afterSHA256':intake.sha(args.out/'identity-after.json'),
          'recordBeforeSHA256':intake.sha(args.out/'installed-record-before.json'),
          'recordAfterSHA256':intake.sha(args.out/'installed-record-after.json'),
          'identityUnchanged':(args.out/'identity-before.json').read_bytes()==(args.out/'identity-after.json').read_bytes(),
          'recordUnchanged':(args.out/'installed-record-before.json').read_bytes()==(args.out/'installed-record-after.json').read_bytes(),
          'publishable':False,'readyForEnrollment':False}
        if not pair['identityUnchanged'] or not pair['recordUnchanged']:raise ValueError('C1 observation changed installed wheel/RECORD')
        intake.write(args.out/'identity-pair.json',pair)

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for n in ('controller','owner','wheel','out'):p.add_argument('--'+n,type=Path,required=True)
    for n in ('controller-sha','observer-run','observer-attempt'):p.add_argument('--'+n,required=True)
    a=p.parse_args();raise SystemExit(run(a))
