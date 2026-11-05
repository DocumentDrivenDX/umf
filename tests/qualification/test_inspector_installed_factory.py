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

def load():
    spec=importlib.util.spec_from_file_location('factory_probe_pure',ROOT/'tools/probe_inspector_installed_factory.py')
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
            self.assertEqual(identity['inheritedPrivateMetadataVersion'],'7.8.6');self.assertEqual(identity['scope'],'private-component-only-not-release-proof');self.assertEqual(pins['profile'],m.CURRENT_PROFILE);self.assertNotEqual(identity['resourceFixtureSHA256'],m.PINS_SHA)
            original=json.loads((ROOT/'tests/qualification/fixtures/inspector-retained-resources.json').read_text());self.assertNotEqual(pins['resources']['coreSchema']['sha256'],original['resources']['coreSchema']['sha256'])
    def test_resigned_wrong_current_profile_counts_paths_metadata_or_data_refuse(self):
        for mode in ('profile','count-bool','raw-path','metadata','data','old-alias'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as raw:
                root=Path(raw);m,c=fixture(root);v=c['installedFactory'];path=root/m.CURRENT_FIXTURE;value=json.loads(path.read_text())
                if mode=='profile':value['profile']='umf.inspector-retained-feasibility-resources/1'
                elif mode=='count-bool':value['resources']['coreSchema']['bytes']=True
                elif mode=='raw-path':value['resources']['coreSchema']['path']='unreviewed.json'
                elif mode=='metadata':value['baseline']['inheritedCoreDistributionVersion']='0.10.8'
                elif mode=='data':value['literalData']['sha256']='0'*64
                elif mode=='old-alias':v['currentInputs']['fixturePath']='tests/qualification/fixtures/inspector-retained-resources.json'
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
        m=load();c=json.loads((ROOT/m.CENSUS).read_text());v=m.selection(ROOT,c)
        early=v['publicControls'];late=[x for g in v['python'] for x in g['cases']]
        self.assertEqual(len(early),18);self.assertEqual(len(late),31)
        self.assertFalse(set(early)&set(late))
        self.assertEqual(sum(len(r['cases']) for r in v['rust']),423)
        old=[x for g in c['python'] for x in g['cases']]
        history=v['legacyDisposition']['historicalOnly']
        self.assertEqual(len(history),1);self.assertIn('test_cold_constructor_and_each_17_vector_dispatch_list_tuple_call_fit_strict_1m',history[0])
        self.assertEqual(set(old)-set(history),set(early+late)-set(v['legacyDisposition']['newPythonCases']))
        self.assertEqual(len([x for x in early if '::RetainedResourceAdmissionNativeTests::' in x]),7)
        self.assertEqual(len([x for x in early if '::PublicRetainedFeasibilityTests::' in x]),8)
        self.assertEqual(len(v['legacyDisposition']['newPythonCases']),3)
        self.assertNotIn(m.CENSUS,v['sourceFiles'])

if __name__=='__main__':unittest.main()
