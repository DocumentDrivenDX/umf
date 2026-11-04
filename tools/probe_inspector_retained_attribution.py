#!/usr/bin/env python3
"""Private bounded observations, never a public1M gate or enrollment receipt."""
import argparse
from collections import Counter
import hashlib
import importlib.util
import importlib.metadata
import json
from pathlib import Path
import platform
import subprocess
import sys

PHASES = frozenset(('native-resource-conversion','native-resource-compilation','native-request-decode',
    'native-inspector-and-result-encoding','native-result-envelope','native-request-model-admission',
    'native-semantic-inspection','native-core-document-validation','native-binding-document-validation',
    'native-resource-consistency-comparison','native-copies-and-projections','native-core-copy',
    'native-schema-compilation','native-schema-validation','native-inner-result-encoding'))
EVENT_CAP = 1_000_000


class Trace:
    """Fixed phase roster and rolling amount digest; no per-charge event list.

    This private diagnostic has no public max_work allowance. EVENT_CAP bounds
    observation/control overhead; exhausting it refuses, never establishes1M.
    """
    def __init__(self):
        self.total = 0; self.count = 0; self.phases = Counter(); self.first_denial = None
        self.amount_hash = hashlib.sha256(); self.last_event = None
    def __call__(self, amount, phase):
        if self.first_denial is not None: raise AssertionError('Callback after first diagnostic denial')
        if type(amount) is not int or not 0 <= amount <= 0xffffffff or phase not in PHASES:
            raise ValueError('Unknown diagnostic phase/amount')
        self.count += 1; self.total += amount; self.phases[phase] += amount
        self.amount_hash.update(amount.to_bytes(8,'little'))
        self.last_event = dict(amount=amount,phase=phase,cumulative=self.total,index=self.count-1)
        if self.count > EVENT_CAP or self.total > 2**64-1:
            self.first_denial = dict(self.last_event)
            return 'RESOURCE_LIMIT','Private attribution event/counter cap exceeded','/private/attribution'
        return None
    def summary(self):
        return dict(total=self.total,eventCount=self.count,phaseWork=dict(self.phases),
                    amountSequenceSHA256=self.amount_hash.hexdigest(),lastEvent=self.last_event,
                    firstDenial=self.first_denial)


def run(args):
    root=args.root.resolve();output=args.output
    source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
    if source != args.source_sha or not sys.flags.isolated or not sys.dont_write_bytecode:
        raise ValueError('Exact isolated controller/source required')
    if platform.python_version()!='3.11.17' or platform.system()!='Linux' or platform.machine()!='x86_64':
        raise ValueError('Only selected Linux311 diagnostic admitted')
    probe_path=Path(__file__).resolve()
    controller=subprocess.check_output(['git','rev-parse','HEAD'],cwd=probe_path.parents[1],text=True).strip()
    probe_hash=hashlib.sha256(probe_path.read_bytes()).hexdigest()
    if controller != args.controller_source or probe_hash != args.probe_sha256:
        raise ValueError('Qualification probe controller source/hash differs')
    spec=importlib.util.spec_from_file_location('owner_probe',root/'tools/probe_inspector_retained_feasibility.py')
    probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)
    resources,pins=probe.resources(root,args.resource_pins_sha256)
    import umf._rust_core as native
    import umf._rust as wire
    dist=importlib.metadata.distribution('umf-core')
    members=probe.installed_wheel(args.wheel,dist)
    row=json.loads((root/probe.CORPUS).read_bytes())['cases'][0]
    request=json.dumps(wire._wire({'op':'codegen/inspectAccessViews','request':row['request']},
        max_depth=256,max_values=sys.maxsize),separators=(',',':'))
    record={'profile':'umf.private-inspector-work-attribution/1','privateDiagnosticOnly':True,
        'publishable':False,'readyForEnrollment':False,'publicMaximumWork':1000000,
        'diagnosticPublic1MProof':False,'diagnosticMaxWork':None,'eventCapPerLifetime':EVENT_CAP,
        'source':source,'controllerSource':controller,'probeSourceSHA256':probe_hash,
        'canonicalResourceSourceS':probe.SOURCE_S,'resourcePins':pins,
        'case':row['id'],'requestSHA256':hashlib.sha256(request.encode()).hexdigest(),
        'wheelSHA256':hashlib.sha256(args.wheel.read_bytes()).hexdigest(),'wheelMembers':members,
        'loadedNative':{'path':native.__file__,'sha256':hashlib.sha256(Path(native.__file__).read_bytes()).hexdigest()},
        'status':'partial','lifetimes':{},'amountSequenceEquivalent':False}
    def write():output.write_text(json.dumps(record,indent=2)+'\n')
    try:
        handles=[]
        for label in ('ordinary','attributed'):
            trace=Trace();record['lifetimes'][label+'-construction']=trace.summary()
            try:handle=native.create_codegen_resources(resources,trace)
            finally:record['lifetimes'][label+'-construction']=trace.summary();write()
            handles.append(handle)
        results=[]
        for label,handle in zip(('ordinary','attributed'),handles):
            trace=Trace()
            try:
                result=(handle.execute_wire if label=='ordinary' else handle.execute_wire_attributed)(request,trace)
                decoded=wire._from_wire(json.loads(wire._checked_envelope(result)))
                if decoded!={'ok':True,'result':row['expected']}:raise ValueError('Original case oracle differs')
                results.append(result)
            finally:record['lifetimes'][label+'-call']=trace.summary();write()
        original,attributed=(record['lifetimes'][k+'-call'] for k in ('ordinary','attributed'))
        assert results[0]==results[1], 'Attribution changed result bytes'
        assert original['amountSequenceSHA256']==attributed['amountSequenceSHA256'], 'Attribution changed charge order/amounts'
        assert original['total']==attributed['total'] and original['eventCount']==attributed['eventCount']
        assert sum(attributed['phaseWork'].values())==attributed['total']
        outside=sum(attributed['phaseWork'].get(k,0) for k in ('native-request-decode','native-result-envelope'))
        assert attributed['total']-outside==original['phaseWork']['native-inspector-and-result-encoding']
        record.update(status='observed',amountSequenceEquivalent=True,resultBytesEquivalent=True,
            sharedInspectionInnerSubtotal=attributed['total']-outside)
        write();return 0
    except BaseException as error:
        record['failure']={'type':type(error).__name__,'code':getattr(error,'code',None),'message':str(error)}
        write();raise


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ('root','wheel','output'):parser.add_argument('--'+name,type=Path,required=True)
    for name in ('source-sha','resource-pins-sha256','controller-source','probe-sha256'):parser.add_argument('--'+name,required=True)
    raise SystemExit(run(parser.parse_args()))
