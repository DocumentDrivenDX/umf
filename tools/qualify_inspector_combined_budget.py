#!/usr/bin/env python3
"""Combined source-only controller; native entry only in explicit hosted modes."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import sysconfig
import time

EVENT_CAP=1_000_000
DEADLINE_SECONDS=300
RECEIPT_BYTES=65536


def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def require(ok,message):
    if not ok:raise ValueError(message)


def protocol(root):
    old=load(root/'tools/inspector_constructor_observation.py','original_closed_slots')
    slots=old.SLOTS+(('unassigned','index-build'),('unassigned','plan-work'),('unassigned','location-lookup'))
    require(len(slots)==len(set(slots))==128<=128,'Closed combined roster differs')
    def slot(phase,role):
        if phase in ('ctor.index-build','ctor.plan-work','ctor.location-lookup'):
            require(type(role)is str and role in old.ROOTS+('constraints','literal-policy'),'Unknown index root role')
            return {'ctor.index-build':125,'ctor.plan-work':126,'ctor.location-lookup':127}[phase]
        return old.slot_for(phase,role)
    return slots,slot


class Trace:
    def __init__(self,attributed,slots,slot,cap=EVENT_CAP):
        require(type(cap)is int and 0<=cap<=EVENT_CAP,'Event cap differs')
        self.attributed=attributed;self.slots=slots;self.slot=slot;self.cap=cap
        self.total=0;self.count=0;self.work=[0]*len(slots);self.events=[0]*len(slots)
        self.digest=hashlib.sha256();self.denial=None;self.last=None;self.after_denial=0
    def __call__(self,amount,phase,role=None):
        if self.denial is not None:
            self.after_denial+=1;raise AssertionError('Callback after first denial')
        require(type(amount)is int and 0<=amount<=0xffffffff,'Unknown charge amount')
        if self.attributed:index=self.slot(phase,role)
        else:
            require(role is None and phase in ('native-resource-conversion','native-resource-compilation'),'Ordinary protocol differs')
            index=self.slots.index(('conversion','factory') if phase=='native-resource-conversion' else ('unassigned','other'))
        self.count+=1;self.total+=amount;self.work[index]+=amount;self.events[index]+=1
        self.digest.update(amount.to_bytes(8,'little'))
        self.last={'amount':amount,'index':self.count-1,'cumulative':self.total}
        if self.count>self.cap or self.total>2**64-1:
            self.denial=dict(self.last)
            return ('RESOURCE_LIMIT','Private attribution event/counter cap exceeded','/private/attribution')
        return None
    def summary(self):
        return {'total':self.total,'eventCount':self.count,'amountSequenceSHA256':self.digest.hexdigest(),
          'lastEvent':self.last,'firstDenial':self.denial,'afterDenial':self.after_denial,
          'slots':[{'root':r,'site':s,'work':self.work[i],'events':self.events[i]} for i,(r,s) in enumerate(self.slots)]}


def observe(factories,resources,slots,slot,output,provenance,clock=time.monotonic,cap=EVENT_CAP):
    started=clock();deadline=started+DEADLINE_SECONDS
    record={'profile':'umf.private-combined-constructor-attribution/1',**provenance,
      'status':'partial','publishable':False,'readyForEnrollment':False,'public1MFit':False,
      'eventCapPerIndependentLifetime':cap,'combinedDeadlineSeconds':DEADLINE_SECONDS,
      'amountSequenceEquivalent':False,'lifetimes':{}}
    def save():
        raw=(json.dumps(record,indent=2)+'\n').encode()
        require(len(raw)<=RECEIPT_BYTES,'Diagnostic receipt exceeds64KiB');output.write_bytes(raw)
    save()
    try:
        for label in ('ordinary','attributed'):
            require(clock()<deadline,'Combined diagnostic deadline reached')
            trace=Trace(label=='attributed',slots,slot,cap);complete=False;terminal=None
            def control(*args):
                if clock()>=deadline:raise TimeoutError('Combined diagnostic deadline reached')
                return trace(*args)
            try:
                handle=factories[label](resources(),control);complete=True
                del handle
            except Exception as error:
                terminal={'type':type(error).__name__,'code':getattr(error,'code',None),
                  'message':str(error)[:256],'path':getattr(error,'path',None)}
                require(trace.denial is not None and terminal=={'type':'UmfCoreError','code':'RESOURCE_LIMIT',
                  'message':'Private attribution event/counter cap exceeded','path':'/private/attribution'},'Unexpected constructor diagnostic failure')
            finally:
                row={**trace.summary(),'completedHandle':complete,'terminal':terminal}
                record['lifetimes'][label]=row;save()
            require(trace.after_denial==0,'Callback after denial')
            require(sum(trace.work)==trace.total and sum(trace.events)==trace.count,'Counter reconciliation differs')
            require(complete==(trace.denial is None),'Constructor published after diagnostic denial')
        a,b=(record['lifetimes'][label] for label in ('ordinary','attributed'))
        for name in ('total','eventCount','amountSequenceSHA256','lastEvent','firstDenial','completedHandle','terminal'):
            require(a[name]==b[name],'Current-source attribution changes '+name)
        require(clock()<deadline,'Combined diagnostic deadline reached')
        record.update(status='observed-complete-pair' if a['completedHandle'] else 'observed-matching-partial-refusals',
          amountSequenceEquivalent=True,elapsedSeconds=clock()-started)
        save();return 0
    except BaseException as error:
        record['failure']={'type':type(error).__name__,'message':str(error)[:256]}
        record['elapsedSeconds']=clock()-started;save();raise


def diagnostic(args):
    # Called only in the separately spawned diagnostic process AFTER observed
    # installed ownership. Source resources remain pristine current-candidate.
    pins=json.loads(args.producer_pins.read_text())
    require(pins['source']==args.controller_sha,'Diagnostic source differs')
    owner=load(args.owner/'tools/probe_inspector_retained_feasibility.py','combined_canonical_resources')
    slots,slot=protocol(args.controller)
    import umf._rust_core as native
    native_hash=hashlib.sha256(Path(native.__file__).read_bytes()).hexdigest()
    require(native_hash==pins['nativeMember']['sha256'],'Diagnostic loaded native differs')
    provenance={'source':pins['source'],'controllerSource':args.controller_sha,
      'wheelSHA256':pins['wheel']['sha256'],'nativeSHA256':native_hash,'loadedNativeFile':native.__file__,
      'resourcePinsSHA256':pins['resourcePinsSHA256'],
      'probeSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
      'comparison':'same changed-source ordinary/attributed factories; never the old golden stream'}
    return observe({'ordinary':native.create_codegen_resources,'attributed':native.create_codegen_resources_attributed},
      lambda:owner.resources(args.owner,pins['resourcePinsSHA256'])[0],slots,slot,
      args.out/'combined-constructor-attribution.json',provenance)


def binding_compile(args):
    # Extension-module disables Python linkage in production; only this
    # test executable links the official selected setup-python interpreter.
    import platform
    require(platform.system()=='Linux' and platform.python_version()=='3.11.17'
      and os.environ.get('GITHUB_ACTIONS')=='true','Only selected hosted interpreter may compile')
    library=Path(sysconfig.get_config_var('LIBDIR'))
    shared=sysconfig.get_config_var('LDLIBRARY')
    require(shared.startswith('libpython3.11.so') and (library/shared).is_file(),'Selected shared interpreter library absent')
    env=dict(os.environ)
    require(not env.get('RUSTFLAGS') and not env.get('CARGO_ENCODED_RUSTFLAGS'),'Unreviewed Rust flags present')
    env['CARGO_ENCODED_RUSTFLAGS']='\x1f'.join(['-L','native='+str(library),'-l','python3.11'])
    with (args.out/'binding-link-inputs.json').open('x') as out:
        json.dump({'interpreter':sys.executable,'version':platform.python_version(),'library':str(library/shared),
          'sha256':hashlib.sha256((library/shared).read_bytes()).hexdigest(),'rustflags':env['CARGO_ENCODED_RUSTFLAGS'].split('\x1f'),
          'scope':'binding test executable only; producer wheel unchanged'},out,indent=2)
    with (args.out/'cargo-tests/binding.jsonl').open('x') as out, (args.out/'cargo-tests/binding.log').open('x') as log:
        subprocess.run(['cargo','test','--locked','--release','-p','umf-core-python','--features','native-postgresql',
          '--lib','--no-run','--message-format=json'],cwd=args.root,env=env,stdout=out,stderr=log,check=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ('root','out'):parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('mode',choices=['binding-compile'])
    args=parser.parse_args();binding_compile(args)
