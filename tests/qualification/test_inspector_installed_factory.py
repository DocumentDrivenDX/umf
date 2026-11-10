"""Pure controller tests. No UMF/native/backend imports or producer execution."""
import ast
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import struct
import types
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
SCRATCH_ROOT=ROOT

def load():
    spec=importlib.util.spec_from_file_location('factory_probe_pure',SCRATCH_ROOT/'tools/probe_inspector_installed_factory.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

class InstalledFactoryControls(unittest.TestCase):
    def test_workflow_selects_distinct_factory_and_preserves_cost_order(self):
        text=(ROOT/'.github/workflows/inspector-retained-attribution.yml').read_text()
        self.assertIn('INSPECTOR_INPUT_PROFILE: installed-canonical/1',text)
        self.assertLess(text.index('Retain genuine wheel and source BEFORE'),text.index('Strict cold constructor and complete public51 COST'))
        self.assertLess(text.index('Strict cold constructor and complete public51 COST'),text.index('Compile selected affected Rust targets'))
        self.assertIn("if: success() && steps.cost-gate.outputs.passed == 'true'",text)
    def test_selected_cost_route_does_not_call_old_probe_or_diagnostic(self):
        source=(ROOT/'tools/run_inspector_cost_gate.py').read_text()
        self.assertIn('probe_inspector_installed_factory.py',source)
        self.assertIn('installed-factory-failure-no-explicit-diagnostic',source)
    def test_pending_census_is_still_refused(self):
        m=load();v=json.loads((ROOT/m.CENSUS).read_text())
        v['installedFactory']['status']='pending-owner-source'
        with self.assertRaisesRegex(ValueError,'pending'):m.selection(ROOT,v)


def native_manifest(m,expected):
    """Execute ONLY actual pinned Python tagged decoder, never import its module.

    Native Value::Number byte sizes are tagged binary64. This is a pure source
    seam, not execution of the native factory or proof of its semantics.
    """
    source=ROOT/'python/src/umf/_rust.py'
    if hashlib.sha256(source.read_bytes()).hexdigest()!='f3b573f016fe6c89ac0d45da62cc49f145ea08622d9244490411248dfbb9fddf':raise AssertionError('Reviewed decoder source changed')
    function=next(n for n in ast.parse(source.read_bytes()).body if isinstance(n,ast.FunctionDef) and n.name=='_from_wire')
    namespace={'Any':object,'struct':struct,'UmfCoreError':ValueError}
    exec(compile(ast.Module(body=[function],type_ignores=[]),str(source),'exec'),namespace)
    def units(text):return list(struct.unpack('<'+'H'*(len(text.encode('utf-16-le'))//2),text.encode('utf-16-le')))
    def wire(value):
        if type(value)is str:return {'kind':'string','units':units(value)}
        if type(value)is int:return {'kind':'number','bits':struct.pack('>d',value).hex()}
        if type(value)is list:return {'kind':'array','items':[wire(x) for x in value]}
        if type(value)is dict:return {'kind':'object','members':[{'key':units(k),'value':wire(v)} for k,v in value.items()]}
        raise AssertionError('Unexpected manifest source fixture')
    return namespace['_from_wire'](wire(expected))

def fixture(root):
    """SYNTHETIC source-reviewed input for pure tests, never live admission."""
    m=load();files=list(m.REQUIRED_SOURCE)+[m.LOADER]+[m.HISTORICAL_CORPUS+'/'+r['path'] for r in json.loads((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_text())['resources'].values()]+['crates/umf-core/src/lib.rs','crates/umf-core/src/fixture_controls.rs','python/tests/factory_fixture.py']
    for name in files:
        p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('# Synthetic source custody fixture only\n')
    for name in [m.LOADER]+[m.HISTORICAL_CORPUS+'/'+r['path'] for r in json.loads((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_text())['resources'].values()]:
        (root/name).write_bytes((ROOT/name).read_bytes())
    (root/m.CORPUS).write_bytes((ROOT/m.CORPUS).read_bytes())
    for helper in ('tools/probe_inspector_installed_factory.py','tools/run_inspector_cost_gate.py','tools/run_inspector_attribution_lanes.py'):
        (root/helper).write_bytes((ROOT/helper).read_bytes())
    declaration='#[cfg(test)]\n#[path="fixture_controls.rs"]\nmod fixture_controls;'
    (root/'crates/umf-core/src/lib.rs').write_text(declaration+'\n')
    (root/'crates/umf-core/src/fixture_controls.rs').write_text('#[test]\nfn original_native_control() {}\n')
    (root/'python/tests/factory_fixture.py').write_text('class Controls:\n    def test_original(self):\n        pass\n    def test_early(self):\n        pass\n')
    # New-route source-only fixture: deliberately synthetic raw9/metadata,
    # never the historical721 input relabeled as a qualified current package.
    (root/'python/pyproject.toml').write_text('[project]\nname="umf-core"\nversion="7.8.6"\n')
    (root/'python/src/umf/__init__.py').write_text('__version__ = "7.8.6"\n')
    old=root/'tests/qualification/fixtures/inspector-retained-resources.json'
    old.write_bytes((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_bytes())
    resources={}
    for name,path in zip(m.NAMES,m.RAW_PATHS):
        p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps({'synthetic-resource':name})+'\n')
        resources[name]={'path':path,'bytes':len(p.read_bytes()),'sha256':m.sha(p)}
    current={'profile':m.CURRENT_PROFILE,'inputProfile':m.INPUT,'maximumWork':m.LIMIT,
      'baseline':{'mainCommit':'1'*40,'mainTree':'2'*40,'inheritedCoreDistributionVersion':'7.8.6','scope':'SYNTHETIC private fixture only'},
      'historicalFixture':{'path':'tests/qualification/fixtures/inspector-retained-resources.json','sha256':m.PINS_SHA,'sourceS':'e3f38ef6f05ae636d2837f9d69f8d6805222664b','scope':'Original unchanged'},
      'resources':resources,'encodingOnlyProducer':{'path':'tools/generate_codegen_resource_literals.py','sha256':m.sha(root/'tools/generate_codegen_resource_literals.py')},
      'literalData':{'path':'crates/umf-core/src/canonical_codegen_literals.rs','sha256':m.sha(root/'crates/umf-core/src/canonical_codegen_literals.rs')},'acceptance':'Provenance only; synthetic not native proof'}
    (root/m.CURRENT_FIXTURE).write_text(json.dumps(current))
    row={'package':'umf-core','target':'lib','features':'native-postgresql','source':'crates/umf-core/src/fixture_controls.rs','cases':[{'name':'fixture_controls::original_native_control'}]}
    selector='python/tests/factory_fixture.py::Controls::test_original'
    v={'status':'source-frozen','inputProfile':m.INPUT,'sourceFiles':{p:m.sha(root/p) for p in files},
       'moduleGraph':[{'parent':'crates/umf-core/src/lib.rs','child':row['source'],'module':'fixture_controls','declaration':declaration,'cfg':['#[cfg(test)]']}],
       'rust':[row],'python':[{'group':'fixture-only','cases':[selector]}],'publicControls':['python/tests/factory_fixture.py::Controls::test_early'],
       'coverage':{name:['rust:umf-core:lib:fixture_controls::original_native_control'] for name in m.COVERAGE},
       'currentInputs':{'fixturePath':m.CURRENT_FIXTURE,'fixtureSHA256':m.sha(root/m.CURRENT_FIXTURE),'metadataVersion':'7.8.6'},
       'modelSHA256':'a'*64,'legacyDisposition':{'oldProbeUnchanged':True,'warmed51IsFactoryEvidence':False,'separateExplicitHistory':'Fixture-only history','historicalOnly':[],'newPythonCases':[]},'closureSHA256':None}
    resign(m,v)
    c={'profile':'umf.private-construction-batch-census/1','python':[{'group':'toy-source','cases':[selector,'python/tests/factory_fixture.py::Controls::test_early']}],'rust':[row],'fileHashes':{},'installedFactory':v}
    path=root/m.CENSUS;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(c))
    pins=root/'tests/qualification/fixtures/inspector-retained-resources.json';pins.write_bytes((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_bytes())
    return m,c

def resign(m,v):v['closureSHA256']=m.digest(m.canonical({k:v[k] for k in ('sourceFiles','moduleGraph','rust','python','publicControls','coverage','modelSHA256','legacyDisposition','currentInputs')}))

def candidate_fixture(root,status='source-bound'):
    m,c=fixture(root);v=c['installedFactory']
    (root/'python/pyproject.toml').write_text('[project]\nname="umf-core"\nversion="0.10.10"\n')
    (root/'python/src/umf/__init__.py').write_text('__version__ = "0.10.10"\n')
    v['sourceFiles']['python/pyproject.toml']=m.sha(root/'python/pyproject.toml')
    v['sourceFiles']['python/src/umf/__init__.py']=m.sha(root/'python/src/umf/__init__.py')
    prior=json.loads((root/m.CURRENT_FIXTURE).read_text())
    generation={'sourceCommit':'3fcf4b80d017793e1d5da059a206d0fe5ca834a0','sourceTree':'d9135287312d7b1f4304bb72de1dab68301b7abf',
      'runId':'SYNTHETIC-NOT-A-G0-RUN','attempt':'1','jobId':'SYNTHETIC-JOB','artifactId':'SYNTHETIC-ARTIFACT','artifactDigest':'a'*64,
      'outputManifestSHA256':'b'*64,'finalAttestationSHA256':'c'*64,'correspondenceReceiptSHA256':'d'*64,'compilerSHA256':'e'*64,'compilerBinarySHA256':'f'*64}
    candidate={'profile':m.CANDIDATE_PROFILE,'inputProfile':m.INPUT,'maximumWork':m.LIMIT,'candidateArtifactVersion':'0.10.10',
      'baseline':{'mainCommit':'ed09f345e38e70fd8c718cb904ffd9185f0ca392','mainTree':'ad4d87ffcf2ce2a5aff15fc26e60e5a0e82021c3','inheritedCoreDistributionVersion':'0.10.9','scope':'SYNTHETIC BASELINE ONLY'},
      'historicalFixture':prior['historicalFixture'],'bindingStatus':status,'generation':generation,'resources':prior['resources'],
      'encodingOnlyProducer':prior['encodingOnlyProducer'],'literalData':prior['literalData'],'candidateModelSHA256':'e'*64,
      'acceptance':'GEN1 source correspondence is independently joined to run 42881309374; this source binding is not native admission and candidate execution/fit remains unknown.'}
    path=root/m.CANDIDATE_FIXTURE;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(candidate))
    v['sourceFiles'][m.CANDIDATE_FIXTURE]=m.sha(path)
    v['modelSHA256']=candidate['candidateModelSHA256']
    v['currentInputs']={'fixturePath':m.CANDIDATE_FIXTURE,'fixtureSHA256':m.sha(path),'metadataVersion':'0.10.10'}
    resign(m,v)
    return m,c

def report_fixture(m,source='a'*40,wheel='b'*64,expected=None,cases=None):
    cases=cases or json.loads((ROOT/m.CORPUS).read_text())['cases']
    expected=expected or m.expected_manifest(json.loads((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_text()))
    observed=native_manifest(m,expected)
    lifetime={'maximumWork':m.LIMIT,'attemptedWork':7,'returnedWork':7,'workCreated':True,'completed':True}
    rows=[{'case':r['id'],'carrier':c,'constructor':dict(lifetime),'call':dict(lifetime),'manifest':dict(lifetime),'completed':True,'manifestSHA256':m.digest(m.canonical(observed)),'sourceManifest':copy.deepcopy(observed),'resultSHA256':m.digest(m.canonical({'ok':True,'result':r['expected']} if c=='dispatcher' else r['expected']))} for r in cases for c in ('dispatcher','list','tuple')]
    return {'profile':m.PROFILE,'inputProfile':m.INPUT,'status':'cost-complete','actualCandidateSource':source,'wheelSHA256':wheel,'maximumWork':m.LIMIT,'inspectionCases':17,'inspectionCalls':51,'freshConstructors':51,'requestCustodyPreserved':True,'installedFilesUnchanged':True,'publishable':False,'readyForEnrollment':False,'pairs':rows}

class FactoryProbePureControls(unittest.TestCase):
    def fake_probe(self,mode=None):
        m=load();events=[];counter=[0];cached=[None];expected=m.expected_manifest(json.loads((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_text()))
        cases=[{'id':str(i),'request':{'document':{'expected':{'index':i}},'selected':[]},'expected':{'index':i}} for i in range(17)]
        observed=native_manifest(m,expected)
        class Refusal(Exception):code='RESOURCE_LIMIT'
        def host_work(maximum,*controls):
            total=[0]
            def work(n):
                total[0]+=n
                if total[0]>maximum:raise Refusal('actual delegated mock work refusal')
            return work
        compiler=types.SimpleNamespace(_host_work=host_work)
        class Engine:
            @classmethod
            def from_installed(cls,*,max_work):
                counter[0]+=1;events.append(('ctor',counter[0],max_work));work=compiler._host_work(max_work)
                work(m.LIMIT+1 if mode=='ctor' and counter[0]==4 else 5)
                if mode=='warm':
                    if cached[0] is None:cached[0]=cls()
                    return cached[0]
                return cls()
            def effect(self,label):
                events.append((label,counter[0],m.LIMIT));work=compiler._host_work(m.LIMIT);work(m.LIMIT+1 if mode==label and counter[0]==4 else 7)
            def call(self,op,request):self.effect('call');return {'ok':True,'result':copy.deepcopy(request['document']['expected'])}
            def inspect_access_views(self,document,selected,bindings,sourceId):self.effect('call');return copy.deepcopy(document['expected'])
            def resource_source_manifest(self):self.effect('manifest');return copy.deepcopy(observed)
        with tempfile.TemporaryDirectory() as raw:
            path=Path(raw)/'partial.json'
            with m.WorkObserver(compiler) as observer:
                if mode=='warm':
                    with self.assertRaisesRegex(ValueError,'Warm engine'):m.probe(Engine,cases,expected,path,{'actualCandidateSource':'a'*40,'wheelSHA256':'b'*64},observer)
                elif mode:
                    with self.assertRaises(Refusal):m.probe(Engine,cases,expected,path,{'actualCandidateSource':'a'*40,'wheelSHA256':'b'*64},observer)
                else:
                    report=m.probe(Engine,cases,expected,path,{'actualCandidateSource':'a'*40,'wheelSHA256':'b'*64},observer)
                    report['installedFilesUnchanged']=True
                    m.complete(report,'a'*40,'b'*64,expected,[(r['id'],c,m.digest(m.canonical({'ok':True,'result':r['expected']} if c=='dispatcher' else r['expected']))) for r in cases for c in ('dispatcher','list','tuple')])
            value=json.loads(path.read_text())
        return value,events
    def test_all51_actual_probe_pairs_construct_before_call_and_read_manifest_after(self):
        report,events=self.fake_probe();self.assertEqual(len(report['pairs']),51);self.assertEqual(len(events),153)
        for i in range(51):self.assertEqual(events[i*3:(i+1)*3],[('ctor',i+1,1000000),('call',i+1,1000000),('manifest',i+1,1000000)])
    def test_cached_handle_substitution_refuses_on_second_cold_pair(self):
        report,events=self.fake_probe('warm');self.assertEqual(report['status'],'failed');self.assertEqual(len(report['pairs']),2);self.assertEqual(events[-1][0],'ctor')
    def test_constructor_call_manifest_first_refusal_retains_partial_and_stops(self):
        for stage in ('ctor','call','manifest'):
            with self.subTest(stage=stage):
                report,events=self.fake_probe(stage);self.assertEqual(report['status'],'resource-limited');self.assertEqual(len(report['pairs']),4);self.assertEqual(report['failure']['code'],'RESOURCE_LIMIT');self.assertFalse(report['pairs'][-1].get('completed',False));self.assertEqual(events[-1][0],stage)
    def test_phase_observation_preserves_exact_999971_plus_denied_43_failure(self):
        m=load();events=[];refusal=type('Refusal',(Exception,),{'code':'RESOURCE_LIMIT'})('Host work budget exceeded')
        def host_work(maximum,*controls):
            total=[0]
            def work(amount):
                if total[0]+amount>maximum:raise refusal
                total[0]+=amount
            return work
        def native_control(work):
            def control(amount,phase=None):
                events.append(('delegated',amount,phase))
                try:work(amount)
                except BaseException as error:
                    control.failure=error
                    return (error.code,str(error),None)
                return None
            control.failure=None
            return control
        compiler=types.SimpleNamespace(_host_work=host_work,_native_control=native_control)
        expected=m.expected_manifest(json.loads((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_text()))
        cases=[{'id':str(i),'request':{'document':{},'selected':[]},'expected':{}} for i in range(17)]
        callbacks=[]
        class Engine:
            @classmethod
            def from_installed(cls,*,max_work):
                work=compiler._host_work(max_work);work(999971)
                control=compiler._native_control(work);callbacks.append(control)
                outcome=control(43,'ordered-fused-transport')
                if outcome is not None:raise control.failure
                return cls()
        with tempfile.TemporaryDirectory() as raw:
            out=Path(raw)/'partial.json'
            with m.WorkObserver(compiler) as observer:
                with self.assertRaises(type(refusal)) as raised:
                    m.probe(Engine,cases,expected,out,{'actualCandidateSource':'a'*40,'wheelSHA256':'b'*64},observer)
            self.assertIs(raised.exception,refusal);self.assertIs(callbacks[0].failure,refusal)
            self.assertIs(compiler._host_work,host_work);self.assertIs(compiler._native_control,native_control)
            report=json.loads(out.read_text());life=report['pairs'][0]['constructor'];phase=life['phaseObservation']
        self.assertEqual(events,[('delegated',43,'ordered-fused-transport')])
        self.assertEqual((life['attemptedWork'],life['returnedWork'],life['completed']),(1000014,999971,False))
        self.assertEqual(phase['phases']['ordered-fused-transport'],{'calls':1,'attemptedWork':43,'returnedWork':0})
        self.assertEqual(phase['unlabeledHostWork'],{'attemptedWork':999971,'returnedWork':999971})
        self.assertEqual(phase['firstFailure'],{'phase':'ordered-fused-transport','phaseSupplied':True,'phaseAvailable':True,
            'root':None,'rootSupplied':False,'rootAvailable':False,'site':None,'siteSupplied':False,'siteAvailable':False,
            'amount':43,'amountAvailable':True,'returnedWorkBefore':999971,'attemptedWorkThroughFailure':1000014})
        self.assertNotIn('remainingWork',phase['firstFailure'])

    def test_phase_aggregates_preserve_forwarding_zero_and_unlabeled_host_work(self):
        m=load();calls=[]
        def host_work(maximum,*controls):
            def work(amount):calls.append(('work',amount))
            return work
        def native_control(work):
            def control(*args,**kwargs):
                calls.append(('control',args,dict(kwargs)));work(args[0]);return None
            control.failure=None
            return control
        compiler=types.SimpleNamespace(_host_work=host_work,_native_control=native_control)
        with m.WorkObserver(compiler) as observer:
            life=observer.begin();work=compiler._host_work(m.LIMIT);work(4)
            control=compiler._native_control(work)
            self.assertIsNone(control(3,'portable-compile',root='model.yaml',site='schema'))
            phase=life['phaseObservation']
            self.assertEqual((phase['lastPhase']['root'],phase['lastPhase']['site']),('model.yaml','schema'))
            work(5);self.assertIsNone(control(0,'zero-check'))
        self.assertEqual(calls,[('work',4),('control',(3,'portable-compile'),{'root':'model.yaml','site':'schema'}),
                                ('work',3),('work',5),('control',(0,'zero-check'),{}),('work',0)])
        self.assertEqual(phase['nativeControlCalls'],2)
        self.assertEqual(phase['phases']['portable-compile'],{'calls':1,'attemptedWork':3,'returnedWork':3})
        self.assertEqual(phase['phases']['zero-check'],{'calls':1,'attemptedWork':0,'returnedWork':0})
        self.assertEqual(phase['unlabeledHostWork'],{'attemptedWork':9,'returnedWork':9})
        self.assertIsNone(phase['lastPhase']['root']);self.assertFalse(phase['lastPhase']['rootAvailable'])
        self.assertIsNone(phase['firstFailure']);self.assertFalse(phase['overflow'])
        m=load();sentinel=RuntimeError('same metadata failure');total=[0];delegated=[]
        def host_work(maximum,*controls):
            self.assertEqual(maximum,m.LIMIT)
            def work(amount):
                if total[0]+amount>4100:raise sentinel
                total[0]+=amount
            return work
        def native_control(work):
            def control(amount,phase=None,*,root=None,site=None):
                delegated.append(amount)
                try:work(amount)
                except BaseException as error:
                    control.failure=error;return ('RESOURCE_LIMIT','same','/host')
                return None
            control.failure=None;return control
        compiler=types.SimpleNamespace(_host_work=host_work,_native_control=native_control)
        with m.WorkObserver(compiler) as observer:
            life=observer.begin();callback=compiler._native_control(compiler._host_work(m.LIMIT))
            for _ in range(4100):self.assertIsNone(callback(1,'native-resource-compilation',root='core',site='ctor.preflight-root'))
            labels={'root':'package','site':'ctor.engine-export'}
            self.assertEqual(callback(56,'native-resource-compilation',**labels),('RESOURCE_LIMIT','same','/host'))
            labels.update(root='unassigned',site='ctor.installed-factory')
            detail=life['phaseObservation'];failure=copy.deepcopy(detail['firstFailure'])
            self.assertIs(callback.failure,sentinel)
            self.assertEqual((failure['root'],failure['site']),('package','ctor.engine-export'))
            self.assertEqual((life['returnedWork'],life['attemptedWork']),(4100,4156))
            self.assertEqual(detail['nativeControlCalls'],4096)
            self.assertEqual(detail['phases'],{'native-resource-compilation':{'calls':4096,'returnedWork':4100,'attemptedWork':4156}})
            self.assertEqual(detail['overflowWork'],{'calls':0,'returnedWork':0,'attemptedWork':0})
            self.assertEqual(detail['firstFailure'],failure)
        self.assertEqual(len(delegated),4101);self.assertIs(compiler._native_control,native_control)
        # A raw callback exception also snapshots metadata before unwind, keeps
        # exact exception identity and is never retried with another signature.
        def raising(work):
            def control(amount,phase=None,*,root=None,site=None):raise sentinel
            return control
        compiler=types.SimpleNamespace(_host_work=host_work,_native_control=raising)
        with self.assertRaises(RuntimeError) as raised:
            with m.WorkObserver(compiler) as observer:
                life=observer.begin();callback=compiler._native_control(compiler._host_work(m.LIMIT))
                callback(7,'native-resource-compilation',root='core',site='ctor.meta-evaluation')
        self.assertIs(raised.exception,sentinel)
        self.assertEqual((life['phaseObservation']['firstFailure']['root'],life['phaseObservation']['firstFailure']['site']),('core','ctor.meta-evaluation'))

        binding=(ROOT/'bindings/core/python/src/retained_codegen.rs').read_text()
        context=(ROOT/'crates/umf-core/src/context.rs').read_text()
        resources=(ROOT/'crates/umf-codegen/src/resources.rs').read_text()
        engine=(ROOT/'crates/umf-core/src/engine.rs').read_text()
        self.assertIn('constructor_metadata = ConstructorMetadata(None)',binding)
        self.assertIn('constructor_metadata=False',binding)
        self.assertIn('is_exact_instance_of::<PyBool>()',binding)
        self.assertIn('callback.call((amount, phase), Some(keywords))',binding)
        self.assertIn('None => failure.check(py, control, amount, phase.get())',binding)
        self.assertIn('constructor_site_observer',context)
        self.assertIn('else if self.constructor_root_observer.is_some() { self.with_work_phase(label, operation) }',context)
        for label in ('ctor.engine-construction','ctor.snapshot-setup','ctor.snapshot-table','ctor.snapshot-catalogue','ctor.snapshot-finish','ctor.operation-read'):
            self.assertIn(label,resources)
        self.assertIn('ctor.engine-export',engine)

    def test_unlabeled_native_callback_preserves_forwarding_without_false_overflow(self):
        m=load()
        # Every row is a real native callback; unavailable metadata is not
        # capacity exhaustion. Compare exact forwarding with no observer too.
        invalid=object()
        for args in [(7,), (7,None), (7,0), (7,''), (7,'x'*129), (7,invalid)]:
            for outcome in [None,object()]:
                with self.subTest(args=args,outcome=outcome):
                    def exercise(observe):
                        received=[]
                        def host_work(maximum,*controls):
                            self.assertEqual(maximum,m.LIMIT)
                            def work(amount):received.append(('work',amount))
                            return work
                        def native_control(work):
                            def control(*actual,**kwargs):
                                received.append(('delegate',actual,kwargs));work(actual[0]);return outcome
                            control.failure=None
                            return control
                        compiler=types.SimpleNamespace(_host_work=host_work,_native_control=native_control)
                        life=None
                        if observe:
                            with m.WorkObserver(compiler) as observer:
                                life=observer.begin();control=compiler._native_control(compiler._host_work(m.LIMIT));actual=control(*args)
                        else:actual=compiler._native_control(compiler._host_work(m.LIMIT))(*args)
                        self.assertIs(actual,outcome)
                        self.assertIs(compiler._host_work,host_work);self.assertIs(compiler._native_control,native_control)
                        return received,life
                    baseline,_=exercise(False);received,life=exercise(True)
                    self.assertEqual(received,baseline)
                    self.assertEqual(received,[('delegate',args,{}),('work',7)])
                    detail=life['phaseObservation']
                    self.assertEqual((life['attemptedWork'],life['returnedWork']),(7,7))
                    self.assertEqual(detail['nativeControlCalls'],1)
                    self.assertEqual(detail['unlabeledNativeWork'],{'calls':1,'attemptedWork':7,'returnedWork':7})
                    self.assertEqual(detail['phases'],{})
                    self.assertEqual(detail['lastPhase']['phaseSupplied'],len(args)>1)
                    self.assertFalse(detail['lastPhase']['phaseAvailable'])
                    self.assertIsNone(detail['lastPhase']['phase'])
                    self.assertFalse(detail['lastPhase']['rootAvailable']);self.assertFalse(detail['lastPhase']['siteAvailable'])
                    self.assertFalse(detail['overflow'])
                    if outcome is None:self.assertIsNone(detail['firstFailure'])
                    else:self.assertEqual(detail['firstFailure']['amount'],7)

    def test_phase_cancellation_deadline_and_opaque_outcomes_preserve_first_failure(self):
        m=load()
        for code in ('CANCELLED','DEADLINE'):
            with self.subTest(code=code):
                failure=type('OriginalControlFailure',(Exception,),{'code':code})(code+' original')
                def exercise(observe):
                    events=[];outcomes=[]
                    def host_work(maximum,*controls):
                        self.assertEqual(maximum,m.LIMIT)
                        def work(amount):
                            events.append(('work',amount))
                            if amount==5:raise failure
                        return work
                    def native_control(work):
                        def control(*args,**kwargs):
                            events.append(('control',args,kwargs))
                            try:work(args[0])
                            except BaseException as error:
                                control.failure=error
                                result=(error.code,str(error),None);outcomes.append(result);return result
                            return None
                        control.failure=None
                        return control
                    compiler=types.SimpleNamespace(_host_work=host_work,_native_control=native_control)
                    def calls():
                        callback=compiler._native_control(compiler._host_work(m.LIMIT))
                        self.assertIsNone(callback(11,'before'))
                        result=callback(5,'failure',root='supplied-root',site='supplied-site')
                        self.assertIs(result,outcomes[-1]);self.assertIs(callback.failure,failure)
                        first=copy.deepcopy(life['phaseObservation']['firstFailure']) if observe else None
                        self.assertIsNone(callback(0,'cleanup'))
                        self.assertIs(callback.failure,failure)
                        if observe:
                            self.assertEqual(life['phaseObservation']['firstFailure'],first)
                            self.assertEqual(first,{'phase':'failure','phaseSupplied':True,'phaseAvailable':True,
                                'root':'supplied-root','rootSupplied':True,'rootAvailable':True,
                                'site':'supplied-site','siteSupplied':True,'siteAvailable':True,
                                'amount':5,'amountAvailable':True,'returnedWorkBefore':11,'attemptedWorkThroughFailure':16})
                        return result
                    life=None
                    if observe:
                        with m.WorkObserver(compiler) as observer:
                            life=observer.begin();result=calls()
                    else:result=calls()
                    self.assertIs(compiler._host_work,host_work);self.assertIs(compiler._native_control,native_control)
                    return events,result,life
                baseline,result,_=exercise(False);observed,actual,life=exercise(True)
                self.assertEqual(observed,baseline);self.assertEqual(actual,result)
                self.assertEqual((life['attemptedWork'],life['returnedWork']),(16,11))
                self.assertEqual(life['phaseObservation']['lastPhase']['phase'],'cleanup')
                self.assertFalse(life['phaseObservation']['overflow'])
        # Invalid or opaque outcomes must be returned by identity, never
        # normalized into a valid error tuple or swallowed into success.
        for outcome in [object(),('malformed',),{'opaque':'outcome'}]:
            events=[]
            def host_work(maximum,*controls):
                def work(amount):events.append(('work',amount))
                return work
            def native_control(work):
                def control(amount,phase=None):events.append(('delegate',amount,phase));work(amount);return outcome
                control.failure=None
                return control
            compiler=types.SimpleNamespace(_host_work=host_work,_native_control=native_control)
            with m.WorkObserver(compiler) as observer:
                life=observer.begin();callback=compiler._native_control(compiler._host_work(m.LIMIT))
                self.assertIs(callback(3,'opaque-result'),outcome)
                first=copy.deepcopy(life['phaseObservation']['firstFailure'])
                self.assertIs(callback(0,'cleanup'),outcome)
                self.assertEqual(life['phaseObservation']['firstFailure'],first)
                self.assertIsNone(callback.failure)
            self.assertEqual(events,[('delegate',3,'opaque-result'),('work',3),('delegate',0,'cleanup'),('work',0)])
            self.assertFalse(life['phaseObservation']['overflow'])
            self.assertIs(compiler._host_work,host_work);self.assertIs(compiler._native_control,native_control)
        sentinel=RuntimeError('unchanged callback exception escaping observer context')
        def host_work(maximum,*controls):return lambda amount:None
        def native_control(work):
            def control(amount,phase=None):raise sentinel
            return control
        compiler=types.SimpleNamespace(_host_work=host_work,_native_control=native_control)
        with self.assertRaises(RuntimeError) as raised:
            with m.WorkObserver(compiler) as observer:
                life=observer.begin();callback=compiler._native_control(compiler._host_work(m.LIMIT));callback(1,'escaping')
        self.assertIs(raised.exception,sentinel)
        self.assertIs(compiler._host_work,host_work);self.assertIs(compiler._native_control,native_control)

    def test_phase_failure_exception_hook_restore_missing_hook_and_bounded_overflow(self):
        m=load();sentinel=RuntimeError('original callback exception')
        def host_work(maximum,*controls):return lambda amount:None
        def raising_control(work):
            def control(amount,phase=None):raise sentinel
            return control
        compiler=types.SimpleNamespace(_host_work=host_work,_native_control=raising_control)
        with m.WorkObserver(compiler) as observer:
            life=observer.begin();control=compiler._native_control(compiler._host_work(m.LIMIT))
            with self.assertRaises(RuntimeError) as raised:control(7,'terminal-exception')
            self.assertIs(raised.exception,sentinel)
            self.assertEqual(life['phaseObservation']['firstFailure']['phase'],'terminal-exception')
        self.assertIs(compiler._host_work,host_work);self.assertIs(compiler._native_control,raising_control)
        no_hook=types.SimpleNamespace(_host_work=host_work)
        with m.WorkObserver(no_hook) as observer:
            unavailable=observer.begin()
            work=no_hook._host_work(m.LIMIT);work(2)
        self.assertFalse(unavailable['phaseObservation']['nativeControlAvailable'])
        self.assertEqual(unavailable['phaseObservation']['unlabeledHostWork'],{'attemptedWork':2,'returnedWork':2})
        def zero_control(work):
            def control(amount,phase=None):return work(amount)
            return control
        compiler=types.SimpleNamespace(_host_work=host_work,_native_control=zero_control)
        with m.WorkObserver(compiler) as observer:
            overflow=observer.begin();work=compiler._host_work(m.LIMIT)
            for index in range(observer.MAX_PHASES+3):compiler._native_control(work)(0,'phase-'+str(index))
        detail=overflow['phaseObservation']
        self.assertEqual(len(detail['phases']),observer.MAX_PHASES);self.assertTrue(detail['overflow'])
        self.assertEqual(detail['nativeControlCalls'],observer.MAX_PHASES+3)
        self.assertEqual(detail['overflowWork'],{'calls':3,'attemptedWork':0,'returnedWork':0})
    def test_complete_receipt_rejects_old_warm_partial_types_results_and_allowances(self):
        m=load();expected=m.expected_manifest(json.loads((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_text()));cases=json.loads((ROOT/m.CORPUS).read_text())['cases'];pairs=[(r['id'],c,m.digest(m.canonical({'ok':True,'result':r['expected']} if c=='dispatcher' else r['expected']))) for r in cases for c in ('dispatcher','list','tuple')]
        mutations=[lambda r:r.update(profile='umf.private-inspector-retained-feasibility/1'),lambda r:r.update(freshConstructors=1),lambda r:r.update(inspectionCalls=True),lambda r:r['pairs'].pop(),lambda r:r['pairs'].__setitem__(0,copy.deepcopy(r['pairs'][1])),lambda r:r['pairs'][0]['constructor'].update(maximumWork=2000000),lambda r:r['pairs'][0]['call'].update(completed=False),lambda r:r['pairs'][0].update(resultSHA256='0'*64),lambda r:r['pairs'][0]['manifest'].update(workCreated=1)]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                r=report_fixture(m);mutate(r)
                with self.assertRaises(ValueError):m.complete(r,'a'*40,'b'*64,expected,pairs)
    def test_manifest_exact_profile_order_rows_types(self):
        m=load();want=m.expected_manifest(json.loads((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_text()))
        for mutate in [lambda r:r.update(inputProfile='retained-native/1'),lambda r:r['resources'].reverse(),lambda r:r['resources'][0].update(bytes=True),lambda r:r['resources'][0].update(sha256='0'*64),lambda r:r.update(validated=True)]:
            value=copy.deepcopy(want);mutate(value)
            with self.assertRaises(ValueError):m.manifest(value,want)
    def test_real_transport_integral_float_sizes_preserve_shape_and_exact_identity(self):
        m=load();want=m.expected_manifest(json.loads((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_text()))
        actual=native_manifest(m,want)
        self.assertNotEqual(m.manifest(actual,want),m.digest(m.canonical(want)))
        with self.assertRaises(ValueError):m.manifest(want,want)
        self.assertTrue(all(type(row['bytes'])is float for row in actual['resources']))
        report=report_fixture(m)
        for row in report['pairs']:
            row['sourceManifest']=copy.deepcopy(actual);row['manifestSHA256']=m.manifest(actual,want)
        cases=json.loads((ROOT/m.CORPUS).read_text())['cases']
        pairs=[(r['id'],c,m.digest(m.canonical({'ok':True,'result':r['expected']} if c=='dispatcher' else r['expected']))) for r in cases for c in ('dispatcher','list','tuple')]
        m.complete(report,'a'*40,'b'*64,want,pairs)
        class FloatSubclass(float):pass
        for bad in (FloatSubclass(actual['resources'][0]['bytes']),want['resources'][0]['bytes'],True,False,0.0,-0.0,-1.0,2.0**53,1.5,float('nan'),float('inf'),float('-inf'),float(want['resources'][0]['bytes']+1),'394103',None):
            value=copy.deepcopy(actual);value['resources'][0]['bytes']=bad
            with self.subTest(size=bad),self.assertRaises(ValueError):m.manifest(value,want)
        # Re-signing a mutated actual report must not change expected byte identity.
        report['pairs'][0]['sourceManifest']['resources'][0]['bytes']+=1
        report['pairs'][0]['manifestSHA256']=m.digest(m.canonical(report['pairs'][0]['sourceManifest']))
        with self.assertRaises(ValueError):m.complete(report,'a'*40,'b'*64,want,pairs)
    def test_source_selection_checks_real_hashes_graph_and_named_methods(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);m,c=fixture(root);self.assertEqual(m.selection(root,c)['inputProfile'],m.INPUT)
            for mutate in [lambda v:v['coverage'].update(ph1_bridge=None),lambda v:v['moduleGraph'][0].update(declaration='foreign mod'),lambda v:v['publicControls'].__setitem__(0,'python/tests/factory_fixture.py::Controls'),lambda v:v['rust'][0].update(target='test:unreviewed'),lambda v:v['rust'][0]['cases'][0].update(name='fixture_controls::substituted'),lambda v:v['sourceFiles'].__setitem__('Cargo.lock','0'*64)]:
                bad=copy.deepcopy(c);mutate(bad['installedFactory']);resign(m,bad['installedFactory'])
                with self.assertRaises(ValueError):m.selection(root,bad)
    def test_pending_live_selection_cannot_admit_before_producer(self):
        m=load();c=json.loads((ROOT/m.CENSUS).read_text())
        for status in ('pending-owner-source','source-frozen'):
            bad=copy.deepcopy(c);bad['installedFactory']['status']=status
            if status=='source-frozen':bad['installedFactory']['coverage']['ph1_bridge']=None
            with self.assertRaises(ValueError):m.selection(ROOT,bad)
    def test_xml_count_alone_or_substituted_name_skip_duplicate_refuses(self):
        m=load();selectors=['python/tests/factory_fixture.py::Controls::test_original']
        with tempfile.TemporaryDirectory() as raw:
            p=Path(raw)/'x.xml'
            for body in ['<testcase classname="python.tests.factory_fixture.Controls" name="foreign"/>','<testcase classname="python.tests.factory_fixture.Controls" name="test_original"><skipped/></testcase>','<testcase classname="python.tests.factory_fixture.Controls" name="test_original"/>'*2]:
                p.write_text('<testsuites><testsuite>'+body+'</testsuite></testsuites>')
                with self.assertRaises(ValueError):m.junit(p,selectors)
    def test_original_explicit_probe_is_byte_identical(self):
        name='tools/probe_inspector_retained_feasibility.py'
        self.assertEqual(hashlib.sha256((ROOT/name).read_bytes()).hexdigest(),'e33e1d352c9861970a7aeb192dc1803e11e6455b086a1cc6c9391ce283c9d49d')


class FactorySourceAdmissionControls(unittest.TestCase):
    def test_pending_source_bind_retains_refusal_before_any_producer(self):
        spec=importlib.util.spec_from_file_location('factory_bind_pure',ROOT/'tools/qualify_inspector_construction_batch.py');batch=importlib.util.module_from_spec(spec);spec.loader.exec_module(batch)
        with tempfile.TemporaryDirectory() as raw:
            out=Path(raw)/'proof';args=types.SimpleNamespace(root=ROOT,out=out,source='e'*40)
            def git(argv,**kwargs):return 'e'*40 if argv[1]=='rev-parse' else b''
            original_read=Path.read_text
            pending=json.loads((ROOT/batch.CENSUS).read_text());pending['installedFactory']['status']='pending-owner-source'
            with patch.object(Path,'read_text',lambda p,*a,**k:json.dumps(pending) if p==ROOT/batch.CENSUS else original_read(p,*a,**k)),patch.dict(batch.os.environ,{'GITHUB_SHA':'e'*40,'GITHUB_ACTIONS':'true','GITHUB_RUN_ATTEMPT':'1','INSPECTOR_INPUT_PROFILE':'installed-canonical/1'}),patch.object(batch.subprocess,'check_output',side_effect=git),patch.object(batch.subprocess,'run',side_effect=AssertionError('producer reached')),patch.object(batch.platform,'python_version',return_value='3.11.17'),patch.object(batch.platform,'system',return_value='Linux'),patch.object(batch.platform,'machine',return_value='x86_64'):
                with self.assertRaisesRegex(ValueError,'pending'):batch.bind(args)
            failure=json.loads((out/'source-admission-refusal.json').read_text());self.assertFalse(failure['producerExecuted']);self.assertFalse(failure['nativeExecuted']);self.assertFalse(failure['publishable'])
    def test_no_native_or_backend_import_at_module_load(self):
        # Inspect the entrypoint graph without executing any backend import.
        tree=ast.parse((ROOT/'tools/probe_inspector_installed_factory.py').read_bytes())
        imports=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom))]
        for node in imports:
            names=[a.name for a in node.names] if isinstance(node,ast.Import) else [node.module]
            self.assertTrue(all(not name.startswith(('umf','_rust','mini_racer')) for name in names))


def real_pytest_root_fixture(pytest_python,output):
    """Separate explicit PURE evidence helper, not a native test collection.

    Caller selects an already-installed pytest8.4.2 interpreter; no install or
    project/backend import occurs. Verify inferred-root RED and fixed-root GREEN.
    """
    import subprocess,os
    output.mkdir(parents=True,exist_ok=True)
    version=subprocess.check_output([pytest_python,'-I','-B','-c','import importlib.metadata; print(importlib.metadata.version("pytest"))'],text=True).strip()
    if version!='8.4.2':raise ValueError('Exact workflow pytest8.4.2 required for this receipt')
    m=load()
    with tempfile.TemporaryDirectory() as raw:
        root=Path(raw).resolve();tests=root/'python/tests';tests.mkdir(parents=True)
        (root/'python/pyproject.toml').write_text('[tool.pytest.ini_options]\naddopts = ""\n')
        source=tests/'test_root_binding.py';source.write_text('import unittest,sys\nclass Controls(unittest.TestCase):\n    def test_exact(self):\n        self.assertFalse(any(n=="umf" or n.startswith("umf.") for n in sys.modules))\n')
        selectors=['python/tests/test_root_binding.py::Controls::test_exact'];rows=[]
        for fixed in (False,True):
            name='fixed' if fixed else 'inferred';xml=output/(name+'.xml')
            argv=[pytest_python,'-I','-B','-m','pytest','-c',str(root/'python/pyproject.toml'),'--noconftest','-q','--junitxml='+str(xml)]
            if fixed:argv+=['--rootdir='+str(root)]
            argv+=[str(root/selectors[0])]
            env={**os.environ,'PYTEST_DISABLE_PLUGIN_AUTOLOAD':'1','PYTHONDONTWRITEBYTECODE':'1'}
            result=subprocess.run(argv,cwd=root,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
            (output/(name+'.log')).write_text(result.stdout)
            if result.returncode:raise AssertionError(result.stdout)
            if fixed:m.junit(xml,selectors)
            else:
                try:m.junit(xml,selectors)
                except ValueError:pass
                else:raise AssertionError('Unbound nested root unexpectedly matched strict repository names')
            rows.append({'rootBound':fixed,'exit':result.returncode,'xmlSHA256':m.sha(xml)})
    receipt={'pytest':version,'noUMFBackendImported':True,'inferredStrictValidation':'REFUSED','explicitStrictValidation':'PASSED','runs':rows,'scope':'temporary pure unittest fixture only; no native/source campaign'}
    (output/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');return receipt

class CurrentInputBindingControls(unittest.TestCase):
    def test_exact_current_fixture_metadata_and_raw9_are_bound_without_legacy_relabel(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);m,c=fixture(root);pins,identity=m.current_inputs(root,c['installedFactory'])
            self.assertEqual(set(identity),{'resourceFixture','resourceFixtureSHA256','inheritedPrivateMetadataVersion','literalDataSHA256','scope'})
            self.assertEqual(identity['inheritedPrivateMetadataVersion'],'7.8.6');self.assertEqual(identity['scope'],'private-component-only-not-release-proof');self.assertEqual(pins['profile'],m.CURRENT_PROFILE);self.assertNotEqual(identity['resourceFixtureSHA256'],m.PINS_SHA)
            original=json.loads((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_text());self.assertNotEqual(pins['resources']['coreSchema']['sha256'],original['resources']['coreSchema']['sha256'])
    def test_pending_candidate_refuses_without_fallback_and_old_fixture_stays_exact(self):
        old=(ROOT/'tests/qualification/fixtures/inspector-installed-current-resources.json').read_bytes()
        self.assertEqual(hashlib.sha256(old).hexdigest(),'251c5e64ede46b686e4b207a020e8da4e78aca7aed236f8e6ce25d193edd2363')
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);m,c=candidate_fixture(root,'pending')
            with self.assertRaisesRegex(ValueError,'Candidate source binding pending'):m.current_inputs(root,c['installedFactory'])
            self.assertEqual(c['installedFactory']['currentInputs']['fixturePath'],m.CANDIDATE_FIXTURE)
            self.assertEqual(m.input_metadata_version({'resourceFixture':m.CURRENT_FIXTURE,'resourceFixtureSHA256':'a'*64,'inheritedPrivateMetadataVersion':'0.10.9','literalDataSHA256':'b'*64,'scope':'private-component-only-not-release-proof'}),'0.10.9')
    def test_synthetic_complete_candidate_is_separate_from_baseline_and_helpers_agree(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);m,c=candidate_fixture(root);pins,identity=m.current_inputs(root,c['installedFactory'])
            self.assertEqual(pins['baseline']['inheritedCoreDistributionVersion'],'0.10.9')
            self.assertEqual(identity['candidateArtifactVersion'],'0.10.10')
            self.assertEqual(identity['resourceFixture'],m.CANDIDATE_FIXTURE)
            self.assertEqual(m.input_metadata_version(identity),'0.10.10')
            batch_spec=importlib.util.spec_from_file_location('candidate_batch_pure',SCRATCH_ROOT/'tools/qualify_inspector_construction_batch.py')
            batch=importlib.util.module_from_spec(batch_spec);batch_spec.loader.exec_module(batch)
            self.assertEqual(m.input_metadata_version(identity),batch.load(SCRATCH_ROOT/'tools/probe_inspector_installed_factory.py','candidate_probe_for_batch').input_metadata_version(identity))
            producer_source=(SCRATCH_ROOT/'tools/qualify_inspector_construction_batch.py').read_text()
            self.assertIn('version=probe.input_metadata_version(source.get(\'currentInputIdentity\'))',producer_source)
    def test_candidate_path_is_fixed_and_runtime_version_reader_is_shared(self):
        m=load();tree=ast.parse((SCRATCH_ROOT/'tools/probe_inspector_installed_factory.py').read_bytes())
        run=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='run')
        self.assertTrue(any(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='input_metadata_version' for n in ast.walk(run)))
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);_,c=candidate_fixture(root);c['installedFactory']['currentInputs']['fixturePath']='/tmp/caller.json'
            with self.assertRaisesRegex(ValueError,'Unknown fixed'):m.current_inputs(root,c['installedFactory'])
    def test_mocked_attribution_identity_uses_candidate_version_for_verifier_and_wheel(self):
        import importlib.metadata,os,platform,sys,sysconfig
        from pathlib import PurePosixPath
        spec=importlib.util.spec_from_file_location('attribution_identity_pure',SCRATCH_ROOT/'tools/run_inspector_attribution_lanes.py')
        caller=importlib.util.module_from_spec(spec);spec.loader.exec_module(caller)
        with tempfile.TemporaryDirectory() as raw:
            work=Path(raw);owner=work/'owner';controller=work/'controller';out=work/'out';platlib=work/'site';wheel=work/'candidate.whl'
            for directory in (owner/'tools',controller,out,platlib/'umf'):directory.mkdir(parents=True,exist_ok=True)
            verifier=owner/'tools/verify_python_artifacts.py';verifier.write_bytes(b'SYNTHETIC PURE VERIFIER SOURCE')
            wheel.write_bytes(b'SYNTHETIC WHEEL IDENTITY INPUT');wheel_sha=hashlib.sha256(wheel.read_bytes()).hexdigest()
            identity={'resourceFixture':'tests/qualification/fixtures/inspector-installed-candidate-01010-resources.json','resourceFixtureSHA256':'a'*64,'candidateArtifactVersion':'0.10.10','literalDataSHA256':'b'*64,'generation':{'sourceCommit':'c'*40,'sourceTree':'d'*40},'scope':'synthetic-only'}
            dep_versions={'annotated-types':'0.8.0','iniconfig':'2.3.1','packaging':'26.3','pluggy':'1.7.0','pydantic':'2.14.2','pydantic_core':'2.50.2','Pygments':'2.21.0','pytest':'8.4.2','typing-inspection':'0.4.4','typing_extensions':'4.16.0'}
            pins={'wheel':{'sha256':wheel_sha},'resourcePinsSHA256':identity['resourceFixtureSHA256'],'currentInputIdentity':identity,'nativeMember':{'sha256':'unused-in-pure-mock'},'dependencies':dep_versions}
            pinfile=work/'producer.json';pinfile.write_text(json.dumps(pins));(controller/'candidate-census.json').write_text('{}')
            modules={};member_rows=[]
            for name in ('umf/__init__.py','umf/rust_codegen.py','umf/_rust.py','umf/_rust_core.abi3.so'):
                path=platlib/name;path.parent.mkdir(parents=True,exist_ok=True);body=('SYNTHETIC '+name).encode();path.write_bytes(body)
                member_rows.append({'name':name,'sha256':hashlib.sha256(body).hexdigest()})
                module_name={'umf/__init__.py':'umf','umf/rust_codegen.py':'umf.rust_codegen','umf/_rust.py':'umf._rust','umf/_rust_core.abi3.so':'umf._rust_core'}[name]
                module=types.ModuleType(module_name);module.__file__=str(path);modules[module_name]=module
            pins['nativeMember']['sha256']=next(row['sha256'] for row in member_rows if row['name']=='umf/_rust_core.abi3.so')
            pinfile.write_text(json.dumps(pins))
            modules['umf'].__path__=[];modules['umf'].__version__='0.10.10'
            modules['umf._rust_core'].engine_version=lambda:'umf-core-r2'
            modules['umf._rust_core'].codegen_protocol_version=lambda:'umf-codegen-r3-seven-ops-nine-resources/1'
            modules['umf']._rust=modules['umf._rust'];modules['umf']._rust_core=modules['umf._rust_core'];modules['umf'].rust_codegen=modules['umf.rust_codegen']
            dist=types.SimpleNamespace(version='0.10.10',files=[PurePosixPath(row['name']) for row in member_rows],locate_file=lambda name:platlib/name)
            helper=types.SimpleNamespace(CENSUS='candidate-census.json')
            helper.selection=lambda root,census:{'sourceFiles':{'tools/verify_python_artifacts.py':hashlib.sha256(verifier.read_bytes()).hexdigest()}}
            helper.current_inputs=lambda root,selected:({'resources':{}},identity)
            helper.input_metadata_version=unittest.mock.Mock(return_value='0.10.10')
            helper.installed_wheel=unittest.mock.Mock(return_value=member_rows)
            caller.load=lambda path,name:helper if path.name=='probe_inspector_installed_factory.py' else types.SimpleNamespace()
            caller.pip_generated_metadata=unittest.mock.Mock()
            commands=[]
            def subprocess_run(argv,**kwargs):commands.append(argv);return types.SimpleNamespace(returncode=0)
            args=types.SimpleNamespace(owner=owner,controller=controller,out=out,producer_pins=pinfile,wheel=wheel,controller_sha='synthetic-controller')
            fake_sys=types.SimpleNamespace(flags=types.SimpleNamespace(isolated=True),dont_write_bytecode=True,executable=sys.executable)
            with patch.dict(os.environ,{'INSPECTOR_INPUT_PROFILE':'installed-canonical/1'}),patch.dict(sys.modules,modules),patch.object(caller,'sys',fake_sys),patch.object(platform,'python_version',return_value='3.11.17'),patch.object(platform,'system',return_value='Linux'),patch.object(platform,'machine',return_value='x86_64'),patch.object(sysconfig,'get_path',return_value=str(platlib)),patch.object(importlib.metadata,'distribution',return_value=dist),patch.object(importlib.metadata,'version',side_effect=dep_versions.__getitem__) as dependency_lookup,patch.object(caller.subprocess,'run',side_effect=subprocess_run):
                caller.identity(args,'initial')
                caller.identity(args,'public-before')
            self.assertEqual(helper.input_metadata_version.call_args_list,[unittest.mock.call(identity),unittest.mock.call(identity)])
            self.assertEqual([call.args[2] for call in helper.installed_wheel.call_args_list],['0.10.10','0.10.10'])
            self.assertEqual([call.args[3] for call in caller.pip_generated_metadata.call_args_list],['0.10.10','0.10.10'])
            self.assertEqual([argv[argv.index('--expected-version')+1] for argv in commands],['0.10.10','0.10.10'])
            self.assertEqual(dependency_lookup.call_args_list,[unittest.mock.call(name) for _ in range(2) for name in dep_versions])
    def test_candidate_version_authority_and_genuine_bindings_are_closed(self):
        for mode in ('metadata','pyproject','baseline','mixed-version','missing-evidence','source-tree'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as raw:
                root=Path(raw);m,c=candidate_fixture(root);v=c['installedFactory'];path=root/m.CANDIDATE_FIXTURE;value=json.loads(path.read_text())
                if mode=='metadata':v['currentInputs']['metadataVersion']='0.10.9'
                elif mode=='pyproject':(root/'python/pyproject.toml').write_text('[project]\nname="umf-core"\nversion="0.10.9"\n');v['sourceFiles']['python/pyproject.toml']=m.sha(root/'python/pyproject.toml')
                elif mode=='baseline':value['baseline']['inheritedCoreDistributionVersion']='0.10.10'
                elif mode=='source-tree':value['generation']['sourceTree']='f'*40
                elif mode=='missing-evidence':value['generation']['finalAttestationSHA256']=None
                path.write_text(json.dumps(value));v['sourceFiles'][m.CANDIDATE_FIXTURE]=m.sha(path);v['currentInputs']['fixtureSHA256']=m.sha(path);resign(m,v)
                if mode=='mixed-version':
                    identity={'resourceFixture':m.CANDIDATE_FIXTURE,'resourceFixtureSHA256':'a'*64,'candidateArtifactVersion':'0.10.10','inheritedPrivateMetadataVersion':'0.10.9','literalDataSHA256':'b'*64,'generation':value['generation'],'scope':'private'}
                    with self.assertRaises(ValueError):m.input_metadata_version(identity)
                else:
                    with self.assertRaises(ValueError):m.current_inputs(root,v)
    def test_candidate_raw_data_producer_mismatches_refuse_after_resigning(self):
        for key in ('coreSchema','literalData','encodingOnlyProducer'):
            with self.subTest(key=key),tempfile.TemporaryDirectory() as raw:
                root=Path(raw);m,c=candidate_fixture(root);v=c['installedFactory'];path=root/m.CANDIDATE_FIXTURE;value=json.loads(path.read_text())
                if key=='coreSchema':value['resources'][key]['sha256']='0'*64
                else:value[key]['sha256']='0'*64
                path.write_text(json.dumps(value));v['sourceFiles'][m.CANDIDATE_FIXTURE]=m.sha(path);v['currentInputs']['fixtureSHA256']=m.sha(path);resign(m,v)
                with self.assertRaises(ValueError):m.current_inputs(root,v)
    def test_resigned_wrong_current_profile_counts_paths_metadata_or_data_refuse(self):
        for mode in ('profile','count-bool','raw-path','metadata','data','old-alias','legacy-extra-version','mixed-version-authority'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as raw:
                root=Path(raw);m,c=fixture(root);v=c['installedFactory'];path=root/m.CURRENT_FIXTURE;value=json.loads(path.read_text())
                if mode=='profile':value['profile']='umf.inspector-retained-feasibility-resources/1'
                elif mode=='count-bool':value['resources']['coreSchema']['bytes']=True
                elif mode=='raw-path':value['resources']['coreSchema']['path']='unreviewed.json'
                elif mode=='metadata':value['baseline']['inheritedCoreDistributionVersion']='0.10.8'
                elif mode=='data':value['literalData']['sha256']='0'*64
                elif mode=='old-alias':v['currentInputs']['fixturePath']='tests/qualification/fixtures/inspector-retained-resources.json'
                elif mode=='legacy-extra-version':v['currentInputs']['inheritedPrivateMetadataVersion']='0.10.10'
                elif mode=='mixed-version-authority':v['currentInputs']['candidateArtifactVersion']='0.10.10'
                path.write_text(json.dumps(value));v['sourceFiles'][m.CURRENT_FIXTURE]=m.sha(path);v['currentInputs']['fixtureSHA256']=m.sha(path);resign(m,v)
                with self.assertRaises(ValueError):m.current_inputs(root,v)
    def test_current_fixture_missing_pending_or_unpinned_refuses(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);m,c=fixture(root);v=c['installedFactory']
            v['currentInputs']=None
            with self.assertRaisesRegex(ValueError,'pending'):m.current_inputs(root,v)
            m,c=fixture(root);v=c['installedFactory'];v['sourceFiles'][m.CURRENT_FIXTURE]='0'*64
            with self.assertRaises(ValueError):m.current_inputs(root,v)
    def test_version_aware_wheel_record_and_installed_payload_refuse_metadata_mismatch(self):
        import zipfile,io,csv,base64
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);site=root/'site';site.mkdir();wheel=root/'fake.whl';version='7.8.6';info='umf_core-'+version+'.dist-info'
            files={'umf/__init__.py':b'PURE NONEXECUTED PACKAGE FIXTURE',info+'/METADATA':b'Metadata-Version: 2.1\nName: umf-core\nVersion: 7.8.6\n'}
            stream=io.StringIO();writer=csv.writer(stream,lineterminator='\n')
            for name,body in files.items():writer.writerow([name,'sha256='+base64.urlsafe_b64encode(hashlib.sha256(body).digest()).rstrip(b'=').decode(),str(len(body))])
            writer.writerow([info+'/RECORD','','']);files[info+'/RECORD']=stream.getvalue().encode()
            with zipfile.ZipFile(wheel,'w') as z:
                for name,body in files.items():z.writestr(name,body);p=site/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(body)
            dist=types.SimpleNamespace(version=version,locate_file=lambda name:site/name);m=load();self.assertEqual(len(m.installed_wheel(wheel,dist,version)),3)
            for expected in ('0.10.8','0.10.9'):
                with self.assertRaises(ValueError):m.installed_wheel(wheel,dist,expected)
            (site/'umf/__init__.py').write_bytes(b'mutant')
            with self.assertRaises(ValueError):m.installed_wheel(wheel,dist,version)


class Lifecycle2Controls(unittest.TestCase):
    def run_mocked_lifecycle(self,mode='pass'):
        import os,xml.etree.ElementTree as ET
        m=load();spec=importlib.util.spec_from_file_location('lifecycle2_driver_pure',SCRATCH_ROOT/'tools/run_inspector_attribution_lanes.py')
        driver=importlib.util.module_from_spec(spec);spec.loader.exec_module(driver)
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);out=root/'out';out.mkdir();
            sources={}
            for name in driver.LIFECYCLE2_SOURCE_FILES:
                source=ROOT/name;path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(source.read_bytes())
                sources[name]=hashlib.sha256(path.read_bytes()).hexdigest()
            identity={'resourceFixture':m.CANDIDATE_FIXTURE,'resourceFixtureSHA256':'a'*64,'candidateArtifactVersion':'0.10.10','literalDataSHA256':'b'*64,'generation':{'sourceCommit':'c'*40,'sourceTree':'d'*40},'scope':'synthetic lifecycle control only'}
            producer={'source':'e'*40,'inputProfile':'installed-canonical/1','currentInputIdentity':identity,
              'wheel':{'path':'/synthetic/same-job.whl','bytes':123,'sha256':'f'*64},
              'nativeMember':{'path':'umf/_rust_core.abi3.so','sha256':'1'*64}}
            pinfile=root/'producer.json';pinfile.write_text(json.dumps(producer))
            result_path=out/'saga-lifecycle2-result.json';result_path.write_text(json.dumps({'profile':'umf.private-installed-saga-lifecycle2/1','status':'not-reached-prerequisites','source':'e'*40,'cases':list(driver.LIFECYCLE2_CASES)}))
            selected={'sourceFiles':dict(sources)}
            if mode=='source':selected['sourceFiles'][driver.LIFECYCLE2_SOURCE_FILES[0]]='0'*64
            if mode=='corpus':selected['sourceFiles'][driver.LIFECYCLE2_SOURCE_FILES[1]]='0'*64
            if mode=='producer':producer['source']='9'*40;pinfile.write_text(json.dumps(producer))
            args=types.SimpleNamespace(controller=root,out=out,controller_sha='e'*40,producer_pins=pinfile)
            calls=[]
            def identity_call(args,suffix):
                calls.append(suffix);wheel_sha='0'*64 if mode=='wheel' and suffix=='lifecycle2-before' else producer['wheel']['sha256']
                row={'profile':'umf.private-retained-installed-identity/1','artifactSource':driver.OWNER,'controllerSource':args.controller_sha,
                  'completeWheelAndInstalledRecordVerified':True,'distributionOwnershipVerified':True,'wheelSHA256':wheel_sha,
                  'currentInputIdentity':identity,'loadedModules':{'umf/_rust_core.abi3.so':{'sha256':producer['nativeMember']['sha256']}}}
                (out/('identity-'+suffix+'.json')).write_text(json.dumps(row))
            driver.identity=identity_call
            def subprocess_run(argv,stdout,stderr,timeout):
                calls.append('pytest');stdout.write(b'synthetic mocked pytest log\n')
                junit=Path(next(x.split('=',1)[1] for x in argv if x.startswith('--junitxml=')))
                cases=[]
                for index,selector in enumerate(driver.LIFECYCLE2_CASES):
                    _,class_name,method=selector.split('::');classname=selector.split('::')[0].removesuffix('.py').replace('/','.')+'.'+class_name
                    if mode=='missing' and index==1:continue
                    testcase=ET.Element('testcase',{'classname':classname,'name':method})
                    if mode=='skip' and index==0:ET.SubElement(testcase,'skipped')
                    if mode=='failure' and index==0:ET.SubElement(testcase,'failure')
                    cases.append(testcase)
                if mode=='extra':cases.append(ET.Element('testcase',{'classname':'foreign','name':'unselected'}))
                if mode=='invalid-xml':junit.write_text('<testsuites><broken>')
                else:
                    suite=ET.Element('testsuite');suite.extend(cases);ET.ElementTree(suite).write(junit,encoding='unicode')
                return types.SimpleNamespace(returncode=1 if mode=='exit' else 0)
            driver.subprocess.run=subprocess_run
            with patch.dict(os.environ,{'GITHUB_RUN_ID':'42600000000','GITHUB_RUN_ATTEMPT':'1'}):result=driver.run_installed_lifecycle2(args,m,selected)
            retained=json.loads(result_path.read_text())
            return retained,calls

    def test_two_fixed_cases_run_after_semantic_stages_without_changing_censuses(self):
        row,calls=self.run_mocked_lifecycle()
        self.assertEqual(row['status'],'passed');self.assertTrue(row['passed'])
        self.assertEqual(row['cases'],['python/tests/test_saga_lifecycle.py::InstalledSagaLifecycle::test_author_declare_edit_exchange_and_assess','python/tests/test_saga_lifecycle.py::InstalledSagaLifecycle::test_unknown_recovery_meaning_refuses_edit'])
        self.assertEqual(row['wheel']['sha256'],'f'*64);self.assertEqual(row['nativeMember']['sha256'],'1'*64)
        self.assertEqual(row['identityBefore']['path'],'identity-lifecycle2-before.json');self.assertEqual(row['identityAfter']['path'],'identity-lifecycle2-after.json')
        self.assertEqual((row['run'],row['attempt']),('42600000000','1'))
        self.assertEqual(set(row['sourceFiles']),{'python/tests/test_saga_lifecycle.py','fixtures/saga/portable.json'})
        self.assertEqual(row['processExitCode'],0);self.assertTrue(row['log']['sha256']);self.assertTrue(row['junit']['sha256']);self.assertEqual(row['evidenceScope'],'same-wheel-installed-lifecycle-semantics-only');self.assertNotIn('maximumWork',row)
        argv=row['pytestArgv'];self.assertEqual(argv[0],row['consumerInterpreter']);self.assertEqual(argv[1:8],['-I','-B','-m','pytest','--rootdir='+row['controllerRoot'],'--maxfail=0','-q'])
        self.assertEqual(argv[8],'-s');self.assertEqual(Path(argv[9].split('=',1)[1]).resolve(),(Path(row['controllerRoot'])/'out/saga-lifecycle2.xml').resolve());self.assertEqual([str(Path(value).resolve().relative_to(Path(row['controllerRoot']).resolve())) for value in argv[-2:]],row['cases'])
        self.assertEqual(calls,['lifecycle2-before','pytest','lifecycle2-after'])
        census=json.loads((ROOT/'tests/qualification/fixtures/inspector-construction-batch.json').read_text());factory=census['installedFactory']
        self.assertEqual(len(factory['publicControls']),18);self.assertEqual(sum(len(group['cases']) for group in factory['python']),31)
        self.assertEqual(sum(len(target['cases']) for target in factory['rust']),493)
        source=(SCRATCH_ROOT/'tools/run_inspector_attribution_lanes.py').read_text();tree=ast.parse(source)
        run=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='run_installed')

    def test_lifecycle2_actual_runner_refuses_missing_extra_skip_failure_xml_and_exit(self):
        for mode in ('missing','extra','skip','failure','invalid-xml','exit'):
            with self.subTest(mode=mode):
                row,calls=self.run_mocked_lifecycle(mode)
                self.assertEqual(row['status'],'failed');self.assertFalse(row['passed'])
                self.assertEqual(calls,['lifecycle2-before','pytest','lifecycle2-after'])
                self.assertIn('identityBefore',row);self.assertIn('identityAfter',row)

    def test_lifecycle2_source_producer_and_wheel_identity_mismatch_refuse_before_pytest(self):
        for mode in ('source','corpus','producer','wheel'):
            with self.subTest(mode=mode):
                row,calls=self.run_mocked_lifecycle(mode)
                self.assertEqual(row['status'],'failed');self.assertFalse(row['passed']);self.assertNotIn('pytest',calls)

    def test_lifecycle2_run_is_after_existing_cost_and_all_semantic_stages(self):
        source=(SCRATCH_ROOT/'tools/run_inspector_attribution_lanes.py').read_text();tree=ast.parse(source)
        run=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='run_installed')
        call=next(n for n in ast.walk(run) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='run_installed_lifecycle2')
        stages=[n.lineno for n in ast.walk(run) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in ('intake','saga')]
        self.assertTrue(stages and max(stages)<call.lineno)
        self.assertGreater(call.lineno,max(n.lineno for n in ast.walk(run) if isinstance(n,ast.For)))
        conditional=next(n for n in ast.walk(run) if isinstance(n,ast.If) and call in ast.walk(n))
        self.assertEqual(ast.unparse(conditional.test),"state['requiredQualificationPassed']")
        self.assertNotIn("pythonGroups'].append({'group':'lifecycle2'",source)
        self.assertIn('for name,dependency_version in pins[\'dependencies\'].items()',source)


class FinalSourceCensusControls(unittest.TestCase):
    def test_saga_single_pin_adapter_inverse_preserves_original_file(self):
        m=load();p=ROOT/'python/tests/test_retained_codegen_saga.py';raw=p.read_bytes()
        self.assertEqual(m.digest(raw),'60bd76e9f453b9ec6c5f29ba29d46688330b61fc29a634a5d0a2703c3a9adf1f')
        self.assertEqual(raw.count(m.CURRENT_LOADER_SHA.encode()),1)
        self.assertEqual(m.digest(raw.replace(m.CURRENT_LOADER_SHA.encode(),m.ORIGINAL_LOADER_SHA.encode())),'080185a705dce27a83d19ba478eeb475e3b0bca79205dd808cdfbf65c0b0926d')
    def test_approved_loader_inverse_audit_retains_exact_original(self):
        m=load();self.assertEqual(m.verified_loader_sha(ROOT),m.CURRENT_LOADER_SHA)
        original=m.original_loader((ROOT/m.LOADER).read_bytes())
        self.assertEqual(m.digest(original),m.ORIGINAL_LOADER_SHA)
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);p=root/m.LOADER;p.parent.mkdir(parents=True);p.write_bytes((ROOT/m.LOADER).read_bytes()+b'\n')
            with self.assertRaises(ValueError):m.verified_loader_sha(root)
    def test_disjoint_early_post_and_history_partition_is_required(self):
        with tempfile.TemporaryDirectory() as raw:
            root=Path(raw);m,c=fixture(root);v=c['installedFactory']
            # Re-signing cannot authorize duplicate execution across stages.
            v['python'][0]['cases']=[v['publicControls'][0]];resign(m,v)
            with self.assertRaisesRegex(ValueError,'partition|overlap'):m.selection(root,c)
    def test_frozen_actual_named_roster_and_required_18_public_controls(self):
        m=load();c=json.loads((ROOT/m.CENSUS).read_text());v=c['installedFactory']
        selected=m.selection(ROOT,c);candidate,identity=m.current_inputs(ROOT,selected)
        self.assertEqual(candidate['generation']['sourceCommit'],'3fcf4b80d017793e1d5da059a206d0fe5ca834a0')
        self.assertEqual(identity['candidateArtifactVersion'],'0.10.10')
        self.assertFalse(c['candidateInputBindingPending']['candidateAdmission'])
        early=v['publicControls'];late=[x for g in v['python'] for x in g['cases']]
        self.assertEqual(len(early),18);self.assertEqual(len(late),31)
        self.assertFalse(set(early)&set(late))
        self.assertEqual(sum(len(r['cases']) for r in v['rust']),493)
        additions=[case for row in v['rust'] for case in row['cases'] if 'preflight_route_storage_independent_tests::ps0' in case['name']]
        self.assertEqual(len(additions),8)
        self.assertEqual({case['name'].rsplit('::',1)[-1] for case in additions},{
            'ps01_actual_specialized_type_field_closure_and_layout',
            'ps02_real_root_catalogue_and_legacy_calls_share_semantic_body',
            'ps03_owned_cold_keyword_keeps_advanced_parent_frontier_and_readback',
            'ps04_unavailable_transition_uses_two_distinct_retained_legacy_demands',
            'ps05_semantic_error_path_and_order_match_original_preflight',
            'ps06_changed_limits_and_foreign_owner_fail_real_borrowed_readback',
            'ps07_pre_effect_cold_denial_retains_real_owned_checked_custody',
            'ps08_independent_reentry_and_panic_poison_cleanup'})
        self.assertTrue(any(edge['child']=='crates/umf-core/src/schema_preflight_route_storage_independent_tests.rs' for edge in v['moduleGraph']))
        self.assertEqual(c['rustCaseCount'],229)
        self.assertEqual(len(c['reviewedControlAdapterExceptions']['files']),9)
        pending=c['candidateInputBindingPending']
        self.assertEqual(pending['candidateMetadataVersion'],'0.10.10')
        self.assertEqual(pending['currentFixture']['metadataVersion'],'0.10.9')
        self.assertFalse(pending['candidateAdmission'])
        old=[x for g in c['python'] for x in g['cases']]
        history=v['legacyDisposition']['historicalOnly']
        self.assertEqual(len(history),1);self.assertIn('test_cold_constructor_and_each_17_vector_dispatch_list_tuple_call_fit_strict_1m',history[0])
        self.assertEqual(set(old)-set(history),set(early+late)-set(v['legacyDisposition']['newPythonCases']))
        self.assertEqual(len([x for x in early if '::RetainedResourceAdmissionNativeTests::' in x]),7)
        self.assertEqual(len([x for x in early if '::PublicRetainedFeasibilityTests::' in x]),8)
        self.assertEqual(len(v['legacyDisposition']['newPythonCases']),3)
        self.assertNotIn(m.CENSUS,v['sourceFiles'])

if __name__=='__main__':unittest.main()
