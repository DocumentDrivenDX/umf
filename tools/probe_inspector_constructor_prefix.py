"""PRIVATE two cold prefixes, same factory/charges, one combined300s deadline."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import time


def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


def observe(native,resources_for_each,protocol,output,clock=time.monotonic,provenance=None):
    started=clock();deadline=started+300
    record={'profile':'umf.private-constructor-prefix-observation/1','status':'partial',
            'publishable':False,'readyForEnrollment':False,'public1MFit':False,
            'eventCapPerIndependentLifetime':1000000,'combinedDeadlineSeconds':300,
            'provenance':provenance,'prefixes':{},'completedConstructorAttribution':False,'unobservedRemainder':True}
    def save():
        raw=(json.dumps(record,indent=2)+'\n').encode()
        if len(raw)>65536:raise ValueError('Observation receipt exceeds64KiB')
        output.write_bytes(raw)
    save()
    try:
        for label in ('ordinary','attributed'):
            if clock()>=deadline:raise TimeoutError('Combined constructor observation deadline')
            trace=protocol.PrefixTrace(label=='attributed');returned=False;terminal=None
            record['prefixes'][label]={**trace.summary(),'terminal':None,'completedHandle':False,'attributed':label=='attributed'};save()
            def control(*args):
                if clock()>=deadline:raise TimeoutError('Combined constructor observation deadline')
                result=trace(*args)
                if trace.count % 100000 == 0:
                    record['prefixes'][label]={**trace.summary(),'terminal':None,'completedHandle':False,'attributed':label=='attributed'};save()
                return result
            try:
                factory=(native.create_codegen_resources if label=='ordinary' else native.create_codegen_resources_attributed)
                factory(resources_for_each(),control);returned=True
            except Exception as error:
                # The expected native error is fixed/bounded; arbitrary exceptions
                # never receive broad terminal-success classification.
                terminal={'type':type(error).__name__,'code':getattr(error,'code',None),
                          'message':str(error)[:256],'path':getattr(error,'path',None)}
                if terminal!=protocol.TARGET['terminal']:raise
            finally:
                record['prefixes'][label]={**trace.summary(),'terminal':terminal,'completedHandle':returned,'attributed':label=='attributed'}
                save()
            protocol.compare_prefix(record['prefixes'][label])
        a,b=(record['prefixes'][k] for k in ('ordinary','attributed'))
        for key in ('total','eventCount','amountSequenceSHA256','terminal'):
            if a[key]!=b[key]:raise ValueError('Attributed prefix differs: '+key)
        if clock()>=deadline:raise TimeoutError('Combined constructor observation deadline')
        record['status']='observed-matching-partial-refusals';record['elapsedSeconds']=clock()-started;save();return 0
    except BaseException as error:
        record['failure']={'type':type(error).__name__,'message':str(error)[:256]}
        record['elapsedSeconds']=clock()-started;save();raise


def main(args):
    import subprocess
    root=args.root.resolve();here=Path(__file__).resolve().parents[1]
    if root!=here or subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()!=args.source:
        raise ValueError('Exact source/controller required')
    if not sys.flags.isolated or not sys.dont_write_bytecode:raise ValueError('Isolated no-bytecode required')
    protocol=load(root/'tools/inspector_constructor_observation.py','ctor_protocol')
    probe=load(root/'tools/probe_inspector_retained_feasibility.py','canonical_resources')
    # Native import only in the explicitly invoked hosted entry point.
    import types
    lanes=load(root/'tools/run_inspector_attribution_lanes.py','child_identity')
    ns=types.SimpleNamespace(controller=root,owner=root,wheel=args.wheel,out=args.output.parent,
                             controller_sha=args.source,producer_pins=args.producer_pins)
    lanes.configure_producer(ns)
    lanes.identity(ns,'constructor-prefix-child-before')
    import umf._rust_core as native
    try:
        import hashlib
        pins=json.loads(args.producer_pins.read_text())
        provenance={'source':args.source,'wheelSHA256':pins['wheel']['sha256'],
                    'nativeSHA256':pins['nativeMember']['sha256'],'observedNativeFile':native.__file__,
                    'probeSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                    'protocolSHA256':hashlib.sha256((root/'tools/inspector_constructor_observation.py').read_bytes()).hexdigest(),
                    'resourcePinsSHA256':args.resource_pins_sha256}
        return observe(native,lambda:probe.resources(root,args.resource_pins_sha256)[0],protocol,args.output,provenance=provenance)
    finally:
        lanes.identity(ns,'constructor-prefix-child-after')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--wheel',type=Path,required=True);p.add_argument('--producer-pins',type=Path,required=True)
    p.add_argument('--source',required=True);p.add_argument('--resource-pins-sha256',required=True)
    raise SystemExit(main(p.parse_args()))
