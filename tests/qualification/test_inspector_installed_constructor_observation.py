"""Pure synthetic delegation/intake/ELF controls. Never import UMF or execute FFI."""
import ast
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import sys
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch
import zipfile
ROOT=Path(__file__).resolve().parents[2]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'tools'/file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
p=load('observation_probe','probe_inspector_installed_constructor_observation.py')
i=load('observation_intake','intake_inspector_installed_observation.py')
PINS=i.fixture(ROOT)
HISTORICAL_PINS=copy.deepcopy(PINS)
HISTORICAL_PINS['baseline']=copy.deepcopy(PINS['historicalC2NegativeFixture']['baseline'])
HISTORICAL_C3_PINS=copy.deepcopy(PINS)
HISTORICAL_C3_PINS['baseline']=copy.deepcopy(PINS['historicalC3NegativeFixture']['baseline'])
HISTORICAL_C5_PINS=copy.deepcopy(PINS)
HISTORICAL_C5_PINS['baseline']=copy.deepcopy(PINS['historicalC5NegativeFixture']['baseline'])


def facade(events):
    """Compile pinned ORIGINAL Python definitions into a closed fake native host."""
    source=ROOT/'python/src/umf/rust_codegen.py'
    assert hashlib.sha256(source.read_bytes()).hexdigest()==PINS['wheelMembers']['umf/rust_codegen.py']['sha256']
    tree=ast.parse(source.read_text());nodes=[ast.ImportFrom(module='__future__',names=[ast.alias(name='annotations')],level=0)]
    for node in tree.body:
        if isinstance(node,ast.FunctionDef) and node.name in ('_host_work','_native_control'):nodes.append(node)
        if isinstance(node,ast.ClassDef) and node.name=='CodegenEngine':
            nodes.append(ast.ClassDef(name='CodegenEngine',bases=[],keywords=[],decorator_list=[],body=[x for x in node.body if isinstance(x,ast.FunctionDef) and x.name=='from_installed']))
    error_tree=ast.parse((ROOT/'python/src/umf/_rust.py').read_text());nodes.insert(1,next(x for x in error_tree.body if isinstance(x,ast.ClassDef) and x.name=='UmfCoreError'))
    module=types.ModuleType('fake_original_facade');native=types.SimpleNamespace();returned=[];failures=[]
    module.__dict__.update(sys=sys,_rust_core=native)
    def raise_native(error):raise AssertionError('Unselected native error decoder')
    module._raise_native=raise_native
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),str(source),'exec'),module.__dict__)
    handle=object()
    def original(control):
        assert control.failure is None
        for amount,phase in events:
            result=control(amount,phase);returned.append(result)
            if result is not None:
                failures.append(control.failure)
                assert control.failure is not None
                raise ValueError('Owned native refusal')
        return handle
    native.create_installed_codegen_resources=original
    return module,native,returned,failures,handle


class DelegationTests(unittest.TestCase):
    def test_exact_original_facade_one_constructor_defaults_and_totals(self):
        module,native,returns,_,_=facade([(2,'ctor.other'),(0,'unknown/\ud800'),(3,'ctor.plan-work')])
        host=module._host_work;export=native.create_installed_codegen_resources;control=module._native_control
        result=p.observe_once(module,native,PINS)
        self.assertEqual(result['counts'],{'hostFactories':1,'nativeExports':1,'constructorCalls':1})
        self.assertTrue(result['constructorCompleted']);self.assertEqual(returns,[None,None,None])
        self.assertEqual(result['streams']['host']['acceptedWork'],16) # 1+5+10, terminalzero retained
        self.assertEqual(result['streams']['native']['acceptedWork'],5)
        self.assertEqual(result['streams']['native']['zero'],1)
        self.assertIs(module._host_work,host);self.assertIs(native.create_installed_codegen_resources,export);self.assertIs(module._native_control,control)
        self.assertFalse(result['publishable']);self.assertFalse(result['readyForEnrollment'])
    def test_first_denial_identity_failure_property_and_stack_before_delegate(self):
        module,native,returns,failures,_=facade([(997484,'ctor.meta-evaluation'),(3848,'ctor.plan-work'),(1,'NEVER')])
        observed=[];original=p.error_fields
        def fields(error):observed.append(error);return original(error)
        class Stack:
            calls=0
            def capture(self):
                self.calls+=1;self_test.assertEqual(len(returns),1)
                return {'status':'synthetic','pcs':[123]}
        self_test=self;stack=Stack()
        with patch.object(p,'error_fields',side_effect=fields):result=p.observe_once(module,native,HISTORICAL_PINS,stack)
        self.assertEqual(stack.calls,1);self.assertEqual(len(returns),2);self.assertIsNotNone(returns[-1])
        self.assertTrue(all(error is failures[0] for error in observed))
        self.assertEqual(result['streams']['host']['acceptedWork'],997485)
        self.assertEqual(result['streams']['host']['attemptedWork'],1001333)
        self.assertEqual(result['streams']['native']['acceptedWork'],997484)
        self.assertEqual(result['deniedNative']['event']['amount'],3848)
        self.assertTrue(result['baselineComparison']['totalsMatch'])
        self.assertEqual(result['counts']['nativeExports'],1);self.assertFalse(result['constructorCompleted'])
    def test_opaque_return_and_generic_exception_are_forwarded_by_identity(self):
        module,native,_,_,handle=facade([]);seen=[];original=native.create_installed_codegen_resources
        def factory(control):value=original(control);seen.append(value);return value
        native.create_installed_codegen_resources=factory
        self.assertTrue(p.observe_once(module,native,PINS)['constructorCompleted']);self.assertIs(seen[0],handle)
        for error in [RuntimeError('same object'),KeyboardInterrupt('unwind')]:
            module,native,*_=facade([]);host=module._host_work
            def fail(control):raise error
            native.create_installed_codegen_resources=fail
            originals=[]
            def fields(value):originals.append(value);return {'type':type(value).__name__}
            with patch.object(p,'error_fields',side_effect=fields):result=p.observe_once(module,native,PINS)
            self.assertIs(originals[-1],error);self.assertIs(module._host_work,host);self.assertIs(native.create_installed_codegen_resources,fail)
    def test_no_callbacks_after_denial_and_failure_tuple_custody(self):
        record=p.Recorder(PINS['bounds'],PINS['phaseNames'])
        row=record.begin('host',(1000001,),{});error=RuntimeError('first');record.refused(row,error)
        with self.assertRaises(p.ObservationFailure):record.begin('native',(1,'ctor.other'),{})
        self.assertEqual(record.events,1);self.assertEqual(record.failure,'callback-after-first-denial')
    def test_native_first_error_path_and_message_not_reconstructed(self):
        module,native,_,failures,_=facade([])
        def factory(control):
            error=module.UmfCoreError('RESOURCE_LIMIT','lone\ud800','/a~1b/\ud800')
            # Exercise original _native_control's exact failure object/tuple.
            original=module._host_work
            def host(*args):
                def work(amount):raise error
                return work
            # Direct callback fixture retains the same source function body.
            callback=module._native_control(host())
            row=callback(1,'ignored');self.assertIs(callback.failure,error)
            self.assertEqual(row,('RESOURCE_LIMIT','lone\ud800','/a~1b/\ud800'))
            raise error
        native.create_installed_codegen_resources=factory
        result=p.observe_once(module,native,PINS)
        self.assertEqual(result['error']['path'],'/a~1b/\ud800')
    def test_reentry_cannot_create_second_host_lifetime(self):
        module,native,*_=facade([]);original=native.create_installed_codegen_resources;attempts=[]
        def factory(control):
            with self.assertRaises(p.ObservationFailure):p.observe_once(module,native,PINS)
            attempts.append(1);return original(control)
        native.create_installed_codegen_resources=factory
        result=p.observe_once(module,native,PINS);self.assertEqual(attempts,[1]);self.assertEqual(result['counts']['hostFactories'],1)
    def test_observer_event_time_and_metadata_failure_not_resource_limit(self):
        for kind in ('events','clock','digest','partial'):
            module,native,*_=facade([(0,'unknown'),(1,'ctor.other')]);pins=copy.deepcopy(PINS);clock=lambda:0;extra={}
            if kind=='events':pins['bounds']['events']=1
            if kind=='clock':
                calls=[0]
                def clock():calls[0]+=1;return 0 if calls[0]==1 else 180
            if kind=='partial':
                # Explicit failure progress function, without native/real file effects.
                extra['progress']=lambda _:(_ for _ in ()).throw(OSError('metadata'))
                pins['bounds']['events']=20000
                module,native,*_=facade([(0,'ctor.other')]*8200)
            if kind=='digest':
                class Bad:
                    def update(self,*args):raise OSError('metadata')
                    def hexdigest(self):return '0'*64
                with patch.object(p.hashlib,'sha256',return_value=Bad()):result=p.observe_once(module,native,pins,clock=clock)
            else:result=p.observe_once(module,native,pins,clock=clock,**extra)
            self.assertTrue(result['constructorCompleted'],kind)
            self.assertEqual(result['status'],'failed-observation',kind)
            self.assertIsNotNone(result['observerFailure'],kind)
    def test_independent_digest_and_tail_literal_encoding_order(self):
        record=p.Recorder(PINS['bounds'],PINS['phaseNames'],clock=lambda:0)
        expected=[]
        for n in range(66):
            row=record.begin('native',(n,'unknown-'+str(n)),{});record.accepted(row)
            expected.append({'event':n+1,'stream':'native','amount':n,'phase':'unknown-metadata','phaseMetadata':'unknown-'+str(n)})
        literal=b''.join((json.dumps(row,ensure_ascii=True,sort_keys=True,separators=(',',':'))+'\n').encode('ascii') for row in expected)
        value=record.receipt();self.assertEqual(value['orderedBeginStreamSHA256'],hashlib.sha256(literal).hexdigest());self.assertEqual(value['tail'],expected[-64:])
        self.assertEqual(value['first'],expected[0]);self.assertEqual(value['last'],expected[-1])
    def test_stack_latch_no_second_attempt_if_capture_unavailable(self):
        calls=[]
        class Stack:
            def capture(self):calls.append(1);raise OSError('no unwind')
        module,native,*_=facade([(997484,'ctor.other'),(3848,'ctor.other')])
        result=p.observe_once(module,native,PINS,Stack());self.assertEqual(calls,[1]);self.assertEqual(result['stack']['status'],'unavailable');self.assertIsNone(result['observerFailure'])


class StackTests(unittest.TestCase):
    def test_fixed_mock_ffi_only_and_capture_bound(self):
        class Image:
            def map_pc(self,pc,maps):return {'pc':pc,'status':'synthetic'}
        for count in (0,-1,65):
            stack=p.StackSnapshot(Image(),lambda b,n:count,[None]*64,64,lambda:'')
            with self.assertRaises(p.ObservationFailure):stack.capture()
            with self.assertRaises(p.ObservationFailure):stack.capture()
        def fake(buffer,limit):self.assertEqual(limit,64);buffer[0]=123;return 1
        stack=p.StackSnapshot(Image(),fake,[None]*64,64,lambda:'')
        self.assertEqual(stack.capture()['pcs'],[123])
    def test_real_parser_on_synthetic_elf_and_maps_not_native_image(self):
        with tempfile.TemporaryDirectory() as raw:
            file=Path(raw)/'not-an-executable.fixture';data=bytearray(1024)
            data[:16]=b'\x7fELF\x02\x01\x01'+b'\x00'*9
            struct.pack_into('<HHIQQQIHHHHHH',data,16,3,62,1,0,64,256,0,64,56,1,64,3,0)
            struct.pack_into('<IIQQQQQQ',data,64,1,5,0,0x1000,0,1024,1024,4096)
            struct.pack_into('<IIQQQQIIQQ',data,256+64,0,2,0,0,512,48,2,0,8,24)
            struct.pack_into('<IIQQQQIIQQ',data,256+128,0,3,0,0,600,9,0,0,1,0)
            struct.pack_into('<IBBHQQ',data,512+24,1,2,0,1,0x1070,32);data[600:609]=b'\0symbol\0\0'
            file.write_bytes(data);digest=hashlib.sha256(data).hexdigest()
            image=p.ELFImage(file,digest,1024,2);st=file.stat();device=f'{os.major(st.st_dev):02x}:{os.minor(st.st_dev):02x}'
            maps=f'400000-401000 r-xp 00000000 {device} {st.st_ino} {image.path}\n'
            row=image.map_pc(0x400080,maps);self.assertEqual(row['nearestSymbol'],'symbol');self.assertEqual(row['symbolOffset'],16);self.assertEqual(row['sourceLine'],'UNKNOWN')
            self.assertIn('unknown',image.map_pc(0x800000,maps)['status'])
            with self.assertRaises(p.ObservationFailure):p.ELFImage(file,'f'*64,1024,2)
            with self.assertRaises(p.ObservationFailure):p.ELFImage(file,digest,1024,3)
            with self.assertRaises(p.ObservationFailure):image.map_pc(0x400080,maps.replace(str(st.st_ino)+' ',str(st.st_ino+1)+' '))


class IntakeTests(unittest.TestCase):
    def test_installed_factory_actual_c2_phase_definitions_have_closed_slots(self):
        # Real source-owned transitions, then actual unchanged-control forwarding
        # against the fake native boundary. No UMF/native/FFI import or call.
        source=(ROOT/'crates/umf-core-wire/src/lib.rs').read_text()
        labels=('native-installed-full-admission','native-resource-compilation')
        transport=(ROOT/'bindings/core/python/src/retained_codegen.rs').read_text()
        for label,transition in [('native-installed-materialization','Cell::new'),('native-result-envelope','phase.set')]:
            self.assertIn(transition+'("'+label+'"',transport)
            self.assertEqual(PINS['phaseNames'].count(label),1)
        for label in labels:
            self.assertIn('ctx.with_work_phase("'+label+'"',source)
            self.assertEqual(PINS['phaseNames'].count(label),1)
        module,native,returns,_,_=facade([(2,labels[0]),(3,labels[1]),(5,'foreign-unrecognised-phase')])
        original=module._native_control
        result=p.observe_once(module,native,PINS)
        self.assertIs(module._native_control,original);self.assertEqual(returns,[None,None,None])
        self.assertEqual(result['phaseTotals'][labels[0]]['acceptedWork'],2)
        self.assertEqual(result['phaseTotals'][labels[1]]['acceptedWork'],3)
        self.assertEqual(result['phaseTotals']['unknown-metadata']['acceptedWork'],5)
        self.assertEqual(result['phaseTotals'][labels[0]]['count'],1)
        self.assertEqual(result['phaseTotals'][labels[1]]['count'],1)
        self.assertEqual(result['phaseTotals']['unknown-metadata']['count'],1)
        self.assertEqual(result['streams']['native']['acceptedWork'],10)
        self.assertEqual(result['streams']['host']['acceptedWork'],21) # initial1 +native10 +facade10
        self.assertEqual(result['status'],'constructor-completed-unqualified')
    def test_exact_parent_and_mutants_reject(self):
        values=[copy.deepcopy(PINS['parentAPIMetadataFixture'][name]) for name in ('run','jobs','artifacts')]
        i.parent_binding(PINS,*values)
        for obj,key,value in [(0,'head_sha','f'*40),(0,'run_attempt',True),(0,'event','push'),(0,'workflow_id',406395332)]:
            rows=copy.deepcopy(values);rows[obj][key]=value
            with self.assertRaises(ValueError):i.parent_binding(PINS,*rows)
        for key,value in [('id',True),('head_sha','f'*40),('labels',['macos-15']),('steps',[])]:
            rows=copy.deepcopy(values);rows[1]['jobs'][0][key]=value
            with self.assertRaises(ValueError):i.parent_binding(PINS,*rows)
        for key,value in [('expired',True),('digest','sha256:'+'f'*64),('name','foreign')]:
            rows=copy.deepcopy(values);rows[2]['artifacts'][0][key]=value
            with self.assertRaises(ValueError):i.parent_binding(PINS,*rows)
    def test_split_checkout_cannot_pass_runtime_as_observer(self):
        args=types.SimpleNamespace(owner=Path('/owner'),controller=Path('/observer'),controller_sha='f'*40)
        def git(root,*args):
            if args[0]=='status':return ''
            if args[0]=='diff':return '\n'.join(i.ALLOWED)
            if args[-1]=='HEAD^{tree}':return PINS['runtimeTree']
            return i.SOURCE if root==Path('/owner') else 'f'*40
        with patch.object(i,'git',side_effect=git),patch.object(i,'sha',side_effect=lambda path:PINS['helpers'][str(path.relative_to('/owner'))] if str(path.relative_to('/owner')) in PINS['helpers'] else 'h'*64):
            args.controller_sha=i.SOURCE
            with self.assertRaises(ValueError):i.checkout(args,PINS)
    def test_source_tar_exact_bytes_and_missing_or_tampered(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);owner=root/'owner';owner.mkdir();(owner/'one').write_bytes(b'actual source')
            pins={'sourceFiles':{'one':{'bytes':13,'sha256':hashlib.sha256(b'actual source').hexdigest(),'mode':0o644}}}
            for kind in ('valid','tamper','missing','path'):
                file=root/(kind+'.tar')
                with tarfile.open(file,'w') as archive:
                    if kind!='missing':
                        item=tarfile.TarInfo('../escape' if kind=='path' else 'one');body=b'actual sourcE' if kind=='tamper' else b'actual source';item.mode=0o644;item.size=len(body);archive.addfile(item,io.BytesIO(body))
                if kind=='valid':i.verify_source_tar(file,pins,owner)
                else:
                    with self.assertRaises(ValueError):i.verify_source_tar(file,pins,owner)
    def test_observation_recipe_static_default_off_and_no_new_build(self):
        body=(ROOT/i.WORKFLOW).read_text();self.assertIn('default: false',body);self.assertIn('timeout-minutes: 3',body)
        self.assertNotIn('cargo ',body);self.assertNotIn('--no-deps',body);self.assertIn('--no-compile',body);self.assertIn('persist-credentials: false',body)
        self.assertNotIn('run_inspector_attribution_lanes.py',body)
        source=(ROOT/'tools/probe_inspector_installed_constructor_observation.py').read_text()
        callsites=[n for n in ast.walk(ast.parse(source)) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='from_installed']
        self.assertEqual(len(callsites),1);self.assertNotIn('inspect_access_views(',source);self.assertNotIn('.resource_source_manifest(',source)
    def test_receipt_cap_and_no_automatic_overwrite(self):
        with tempfile.TemporaryDirectory() as raw:
            path=Path(raw)/'report'
            p.write_receipt(path,{'valid':True},1024)
            with self.assertRaises(FileExistsError):p.write_receipt(path,{'valid':True},1024)
            with self.assertRaises(p.ObservationFailure):p.write_receipt(Path(raw)/'oversize',{'value':'a'*100},4)


class DiagnosticIsolationTests(unittest.TestCase):
    def test_predelegate_metadata_faults_do_not_change_forwarding_or_success(self):
        for site in ('begin','clock','digest'):
            module,native,returns,_,handle=facade([(2,'ctor.other'),(0,'ctor.plan-work'),(3,'unknown')])
            export=native.create_installed_codegen_resources;native_results=[]
            def exact(control):
                value=export(control);native_results.append(value);return value
            native.create_installed_codegen_resources=exact
            if site=='begin':context=patch.object(p.Recorder,'begin',side_effect=OSError('before-delegate'))
            elif site=='digest':
                class Bad:
                    def update(self,*args):raise OSError('digest')
                    def hexdigest(self):return 'f'*64
                context=patch.object(p.hashlib,'sha256',return_value=Bad())
            else:context=patch.object(p.time,'monotonic') # clock is explicitly injected below
            with context:
                clock=(lambda:(_ for _ in ()).throw(OSError('clock'))) if site=='clock' else (lambda:0)
                result=p.observe_once(module,native,PINS,clock=clock)
            self.assertEqual(returns,[None,None,None],site);self.assertIs(native_results[0],handle)
            self.assertTrue(result['constructorCompleted'],site);self.assertEqual(result['status'],'failed-observation',site)
            self.assertEqual(result['counts'],{'hostFactories':1,'nativeExports':1,'constructorCalls':1})
            self.assertFalse(result['baselineComparison']['totalsMatch'])
    def test_postsuccess_bookkeeping_fault_preserves_host_and_native_sentinels(self):
        # A direct fake facade exposes exact successful host/native return identity.
        for fault_stream in ('host','native'):
            module,native,*_=facade([]);host_sentinel=object();native_sentinel=object();handle=object();seen=[]
            def host_factory(*args):
                def work(*items,**kwargs):seen.append(('host',items,kwargs));return host_sentinel
                return work
            module._host_work=host_factory
            def native_export(control):
                value=control(3,'ctor.other');self.assertIs(value,native_sentinel);return handle
            native.create_installed_codegen_resources=native_export
            def raw_control(work):
                def callback(*args,**kwargs):
                    self.assertIs(work(args[0]),host_sentinel)
                    return native_sentinel
                callback.failure=None;return callback
            module._native_control=raw_control
            class Engine:
                @classmethod
                def from_installed(cls,**kwargs):
                    self.assertEqual(kwargs,{'max_work':1000000})
                    work=module._host_work(1000000,None,None,None,None)
                    return native.create_installed_codegen_resources(raw_control(work))
            module.CodegenEngine=Engine
            original=p.Recorder.accepted
            def broken(record,row):
                if row and row['stream']==fault_stream:raise OSError('after successful delegate')
                return original(record,row)
            with patch.object(p.Recorder,'accepted',new=broken):result=p.observe_once(module,native,PINS)
            self.assertEqual(seen,[('host',(3,),{})]);self.assertTrue(result['constructorCompleted'])
            self.assertEqual(result['status'],'failed-observation');self.assertFalse(result['countersComplete'])
    def test_postrefusal_fault_cannot_replace_first_error_or_denied_tuple(self):
        for site in ('refused','error_fields','native-summary'):
            module,native,returns,failures,_=facade([(997484,'ctor.other'),(3848,'ctor.plan-work')])
            error_objects=[];original=p.error_fields;recorder_refused=p.Recorder.refused
            def fields(error):
                error_objects.append(error)
                if site=='error_fields':raise OSError('summary')
                if site=='native-summary' and len(error_objects)>1:raise OSError('native completion summary')
                return original(error)
            def refused(record,row,error):
                error_objects.append(error)
                if site=='refused':raise OSError('refusal bookkeeping')
                return recorder_refused(record,row,error)
            with patch.object(p,'error_fields',side_effect=fields),patch.object(p.Recorder,'refused',new=refused):
                result=p.observe_once(module,native,PINS)
            self.assertEqual(len(returns),2);self.assertEqual(returns[0],None)
            self.assertEqual(returns[1][0],'RESOURCE_LIMIT');self.assertEqual(len(failures),1)
            self.assertTrue(all(error is failures[0] for error in error_objects))
            self.assertFalse(result['constructorCompleted']);self.assertEqual(result['status'],'failed-observation')
            self.assertFalse(result['baselineComparison']['totalsMatch'])
    def test_postdelegate_generic_exception_still_same_object_when_refusal_summary_fails(self):
        for stream in ('host','native'):
            module,native,*_=facade([]);error=RuntimeError('original non-UMF error');caught=[]
            if stream=='native':
                def raw_callback(work):
                    def callback(*args):raise error
                    callback.failure=None;return callback
                module._native_control=raw_callback
                def export(control):
                    try:control(1,'ctor.other')
                    except BaseException as current:caught.append(current);raise
                native.create_installed_codegen_resources=export
            else:
                def host_factory(*args):
                    def work(amount):raise error
                    return work
                module._host_work=host_factory
                def export(control):
                    try:control(1,'ctor.other')
                    except BaseException as current:caught.append(current);raise
                # host initial1 would fail before reaching native. Use closed fake
                # facade that constructs one native control without that initial debit.
                native.create_installed_codegen_resources=export
                class Engine:
                    @classmethod
                    def from_installed(cls,**kwargs):
                        work=module._host_work(1000000,None,None,None,None)
                        return native.create_installed_codegen_resources(module._native_control(work))
                module.CodegenEngine=Engine
            with patch.object(p.Recorder,'refused',side_effect=OSError('observer refusal')):
                result=p.observe_once(module,native,PINS)
            self.assertEqual(len(caught),1);self.assertIs(caught[0],error)
            self.assertEqual(result['status'],'failed-observation');self.assertEqual(result['error']['type'],'RuntimeError')
    def test_final_snapshot_and_error_summary_failures_are_failed_observation(self):
        for site in ('receipt','hexdigest','summary'):
            module,native,*_=facade([(997484,'ctor.other'),(3848,'ctor.other')])
            if site=='receipt':context=patch.object(p.Recorder,'receipt',side_effect=OSError('snapshot'))
            elif site=='summary':context=patch.object(p,'error_fields',side_effect=OSError('all summaries'))
            else:
                real=p.hashlib.sha256
                class BadFinish:
                    def __init__(self):self.state=real()
                    def update(self,*args):return self.state.update(*args)
                    def hexdigest(self):raise OSError('finish digest')
                context=patch.object(p.hashlib,'sha256',side_effect=BadFinish)
            with context:result=p.observe_once(module,native,PINS)
            self.assertEqual(result['status'],'failed-observation',site);self.assertFalse(result['countersComplete'])
            self.assertFalse(result['baselineComparison']['totalsMatch'])
    def test_no_host_delegation_after_refusal_even_if_diagnostic_refused_fails(self):
        module,native,*_=facade([]);calls=[]
        def host_factory(*args):
            def work(amount):calls.append(amount);raise module.UmfCoreError('RESOURCE_LIMIT','original','/original')
            return work
        module._host_work=host_factory
        def export(control):
            result=control(1,'ctor.other');first=control.failure
            self.assertEqual(result,('RESOURCE_LIMIT','original','/original'))
            with self.assertRaises(module.UmfCoreError) as found:control(2,'ctor.other')
            self.assertIs(found.exception,first)
            raise ValueError('Owner refused')
        native.create_installed_codegen_resources=export
        class Engine:
            @classmethod
            def from_installed(cls,**kwargs):
                work=module._host_work(1000000,None,None,None,None)
                control=module._native_control(work)
                try:return native.create_installed_codegen_resources(control)
                except ValueError:
                    if control.failure is not None:raise control.failure
                    raise
        module.CodegenEngine=Engine
        with patch.object(p.Recorder,'refused',side_effect=OSError('metadata')):result=p.observe_once(module,native,PINS)
        self.assertEqual(calls,[1]);self.assertEqual(result['status'],'failed-observation')


class C7RebindingTests(unittest.TestCase):
    def test_c7_endpoint_matches_one_refused_constructor_and_keeps_unknowns_unknown(self):
        endpoint=PINS['currentEndpoint']
        self.assertEqual(endpoint['status'],'resource-limited')
        self.assertTrue(endpoint['workCreated']);self.assertFalse(endpoint['completed'])
        self.assertEqual(endpoint['error']['code'],'RESOURCE_LIMIT')
        self.assertEqual(endpoint['public51PairsAttempted'],0)
        self.assertFalse(endpoint['public18ControlsExecuted'])
        self.assertEqual(endpoint['fullConstructorAndCallCost'],'UNKNOWN/incomplete')
        recorded=endpoint['originalMeasurementCounters']
        self.assertEqual(recorded['returnedWork'],999976);self.assertEqual(recorded['attemptedWork'],1000038)
        self.assertEqual(recorded['phaseCounts'],'UNRECORDED');self.assertEqual(recorded['eventSequence'],'UNRECORDED')
        self.assertEqual(recorded['acceptedDeniedCounters'],'UNRECORDED')
        self.assertEqual(recorded['perCallMeasurement'],'UNRECORDED')
        self.assertEqual(recorded['attemptedMinusReturned'],62)
        self.assertIn('derived arithmetic only',recorded['differenceInterpretation'])
        self.assertEqual(PINS['baseline']['comparisonBasis'],'DERIVED comparison expectations only; not original recorded acceptance/denial counters')

        exact,native,returned,failures,_=facade([(999975,'ctor.other'),(62,'ctor.other'),(1,'UNREACHABLE')])
        actual=p.observe_once(exact,native,PINS)
        self.assertEqual(len(returned),2);self.assertIsNotNone(returned[-1]);self.assertEqual(len(failures),1)
        self.assertEqual(actual['counts'],{'hostFactories':1,'nativeExports':1,'constructorCalls':1})
        self.assertFalse(actual['constructorCompleted'])
        self.assertEqual(actual['streams']['host']['acceptedWork'],999976)
        self.assertEqual(actual['streams']['host']['attemptedWork'],1000038)
        self.assertEqual(actual['deniedNative']['event']['amount'],62)
        self.assertEqual(actual['error']['code'],'RESOURCE_LIMIT')
        self.assertTrue(actual['baselineComparison']['totalsMatch'])

        substituted,native,returned,failures,_=facade([(999974,'ctor.other'),(62,'ctor.other'),(1,'UNREACHABLE')])
        changed=p.observe_once(substituted,native,PINS)
        self.assertEqual(len(returned),2);self.assertEqual(len(failures),1)
        self.assertEqual(changed['streams']['host']['acceptedWork'],999975)
        self.assertEqual(changed['streams']['host']['attemptedWork'],1000037)
        self.assertEqual(changed['deniedNative']['event']['amount'],62)
        self.assertFalse(changed['baselineComparison']['totalsMatch'])

    def test_original_c7_parent_accepts_and_stale_or_mixed_historical_material_refuses(self):
        keys=('run','jobs','artifacts')
        current=[copy.deepcopy(PINS['parentAPIMetadataFixture'][name]) for name in keys]
        i.parent_binding(PINS,*current)
        for historical in ('historicalC6NegativeFixture','historicalC5NegativeFixture','historicalC3NegativeFixture','historicalC2NegativeFixture'):
            original=[copy.deepcopy(PINS[historical]['parentAPIMetadataFixture'][name]) for name in keys]
            for mask in range(1,8):
                values=[copy.deepcopy(original[k] if mask&(1<<k) else current[k]) for k in range(3)]
                with self.subTest(historical=historical,staleParts=mask),self.assertRaises(ValueError):i.parent_binding(PINS,*values)
        for kind in ('artifact-source','artifact-digest','job-source','run-source'):
            values=copy.deepcopy(current)
            if kind.startswith('artifact'):
                target=next(a for a in values[2]['artifacts'] if a['id']==PINS['artifacts']['early']['id'])
                if kind=='artifact-source':target['workflow_run']['head_sha']=PINS['historicalC6NegativeFixture']['runtimeSource']
                else:target['digest']='sha256:'+'f'*64
            elif kind=='job-source':values[1]['jobs'][0]['head_sha']=PINS['historicalC6NegativeFixture']['runtimeSource']
            else:values[0]['head_sha']=PINS['historicalC6NegativeFixture']['runtimeSource']
            with self.subTest(kind=kind),self.assertRaises(ValueError):i.parent_binding(PINS,*values)

    def test_c7_runtime_and_observer_q_are_separate_and_old_c6_is_retained_as_history(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);dest=root/i.FIXTURE;dest.parent.mkdir(parents=True)
            dest.write_text(json.dumps(PINS));self.assertEqual(i.fixture(root)['runtimeSource'],i.SOURCE)
            bad=copy.deepcopy(PINS);bad['runtimeSource']=PINS['historicalC6NegativeFixture']['runtimeSource'];dest.write_text(json.dumps(bad))
            with self.assertRaises(ValueError):i.fixture(root)
        args=types.SimpleNamespace(owner=Path('owner'),controller=ROOT,controller_sha='8'*40)
        def git(where,*argv):
            if argv==('rev-parse','HEAD'):return i.SOURCE if where==args.owner else args.controller_sha
            if argv==('rev-parse','HEAD^{tree}'):return PINS['runtimeTree']
            if argv[0]=='status':return ''
            if argv[0]=='diff':return '\n'.join(i.ALLOWED)
            raise AssertionError(argv)
        with patch.object(i,'git',side_effect=git),patch.object(i,'sha',side_effect=lambda path: PINS['helpers'].get(str(path.relative_to(args.owner))) if path.is_relative_to(args.owner) and str(path.relative_to(args.owner)) in PINS['helpers'] else ('a'*64 if path.is_relative_to(args.owner) else 'b'*64)):
            i.checkout(args,PINS)
            bad=copy.deepcopy(PINS);bad['runtimeTree']=PINS['historicalC6NegativeFixture']['runtimeTree']
            with self.assertRaises(ValueError):i.checkout(args,bad)
            args.controller_sha=i.SOURCE
            with self.assertRaises(ValueError):i.checkout(args,PINS)

    def test_actual_committed_c7_source_and_census_roster_match_archive_and_reject_history(self):
        import subprocess
        self.assertEqual(len(PINS['sourceFiles']),176)
        names=list(PINS['sourceFiles'])
        self.assertIn('tests/qualification/fixtures/inspector-construction-batch.json',names)
        self.assertIn('crates/umf-core/src/schema_scoped_preflight_path_independent_tests.rs',names)
        self.assertIn('crates/umf-core/src/schema_fused_owner_traversal_independent_tests.rs',names)
        data=subprocess.check_output(['git','-C',str(ROOT),'archive','--format=tar',i.SOURCE,'--',*names])
        with tempfile.TemporaryDirectory() as raw:
            owner=Path(raw)/'owner';owner.mkdir();archive=Path(raw)/'source.tar';archive.write_bytes(data)
            with tarfile.open(fileobj=io.BytesIO(data)) as t:
                for row in t:
                    if row.isdir():continue
                    self.assertIn(row.name,PINS['sourceFiles']);self.assertTrue(row.isfile())
                    dest=owner/row.name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(t.extractfile(row).read())
            i.verify_source_tar(archive,PINS,owner)
            for historical in ('historicalC6NegativeFixture','historicalC5NegativeFixture'):
                stale=copy.deepcopy(PINS);stale['sourceFiles']=copy.deepcopy(PINS[historical]['sourceFiles'])
                with self.subTest(historical=historical),self.assertRaises(ValueError):i.verify_source_tar(archive,stale,owner)
            stale=copy.deepcopy(PINS);del stale['sourceFiles']['tests/qualification/fixtures/inspector-construction-batch.json']
            with self.assertRaises(ValueError):i.verify_source_tar(archive,stale,owner)
            tampered=owner/'crates/umf-core/src/schema.rs';tampered.write_bytes(tampered.read_bytes()+b'\n')
            with self.assertRaises(ValueError):i.verify_source_tar(archive,PINS,owner)

    def test_actual_c7_probe_wheel_census_and_parent_custody_are_exact(self):
        self.assertEqual(i.SOURCE,'67b6dbae9d969f8c7e5eb955e97a312be5f45787')
        self.assertEqual(PINS['runtimeSource'],i.SOURCE)
        self.assertEqual(PINS['runtimeTree'],'7be7d431acf7d45642c5afe6f22c485557a13c94')
        self.assertEqual(PINS['parent']['id'],42080909756);self.assertEqual(PINS['parent']['jobID'],127433373229)
        self.assertEqual(PINS['parent']['attempt'],1)
        self.assertEqual({row['id'] for row in PINS['artifacts'].values()},{13441362387,13441562441,13442570078})
        self.assertEqual(sum(len(row['members']) for row in PINS['artifacts'].values()),52)
        self.assertTrue(all(set(member)=={'size','sha256'} for artifact in PINS['artifacts'].values() for member in artifact['members'].values()))
        self.assertEqual(PINS['wheel']['sha256'],'efb9b640c1d0f34113d58230a3c14f6a36728885578aa901cbbf44e1bfe720ab')
        self.assertEqual(PINS['nativeMember']['sha256'],'07454b89f45e8d5f64a3ba0e089fe7bdf847063605d739c88611d6dd5d670d79')
        self.assertEqual(PINS['baseline']['acceptedHostWork'],999976)
        self.assertEqual(PINS['baseline']['attemptedHostWork'],1000038)
        self.assertEqual(PINS['baseline']['refusedCharge'],62)
        self.assertIn('DERIVED comparison expectations',PINS['baseline']['comparisonBasis'])
        self.assertEqual(PINS['stack']['nativeBytes'],58470728)
        self.assertEqual(PINS['parentAPIMetadataFixture']['run']['id'],42080909756)
        self.assertEqual(PINS['parentAPIMetadataFixture']['jobs']['jobs'][0]['id'],127433373229)
        self.assertEqual(PINS['censusSHA256'],'ebfe7a7570f7592b0013e4f07f7db4f93f403af6324cd78c207d3b8abb229c5b')
        self.assertEqual(PINS['closureSHA256'],'615dbde752e447fc4a5202e3eeebf30c4004a3c23dd46dc5f9385e992de97e9f')
        self.assertEqual(PINS['modelSHA256'],'d70777be5f327554ac5dc728d17c9a6a0840131c0e12daeff0c1045b3c48c012')
        self.assertEqual(PINS['sourceArchive']['regularMembers'],176);self.assertEqual(PINS['sourceArchive']['payloadMembers'],175)
        self.assertEqual(hashlib.sha256((ROOT/'tools/probe_inspector_installed_constructor_observation.py').read_bytes()).hexdigest(),'602616fb78edce0130a8b8024c5bc004ed0ede433892bd0c4bf21839cc052967')
        self.assertEqual(PINS['historicalC6NegativeFixture']['runtimeSource'],'ef661afed25b697fba503ee42cf2281ba387282d')


if __name__=='__main__':unittest.main()
