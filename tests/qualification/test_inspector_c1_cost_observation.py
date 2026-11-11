"""Pure source controls for the gated retained-wheel diagnostic route."""
import importlib.util
import hashlib
import io
import json
from pathlib import Path
import struct
import subprocess
import tarfile
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
FIXTURE=ROOT/'tests/qualification/fixtures/inspector-c1-cost-observation.json'
SCRIPT=ROOT/'tools/intake_inspector_c1_cost_observation.py'

def load_module():
    spec=importlib.util.spec_from_file_location('c1_cost_intake_test',SCRIPT)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

class CandidatePins(unittest.TestCase):
    def test_exact_retained_failure_and_static_symtab_pins(self):
        m=load_module();pins=m.fixture(ROOT)
        self.assertEqual((pins['failure']['returnedWork'],pins['failure']['attemptedWork']),(999955,1000024))
        self.assertEqual(pins['failure']['maximumWork'],1000000)
        self.assertEqual(pins['stack']['nativeBytes'],58583808)
        self.assertEqual(pins['stack']['nativeSHA256'],'06a72e1896ab0f2aa1cb04c7d6e4349326c709b242ba2cc08233883cc0941550')
        self.assertEqual((pins['stack']['sectionHeaders'],pins['stack']['symtabEntries'],pins['stack']['symtabBytes']),(33,63457,1522968))
        self.assertFalse(pins['failure']['requestCustodyPreserved'])
        self.assertFalse(pins['failure']['installedFilesUnchanged'])

    def test_historical_c8_controller_allowlist_is_unchanged(self):
        path=ROOT/'tools/intake_inspector_installed_observation.py'
        spec=importlib.util.spec_from_file_location('c8_source_allowlist_test',path)
        c8=importlib.util.module_from_spec(spec);spec.loader.exec_module(c8)
        self.assertEqual(c8.ALLOWED,{
            '.github/workflows/inspector-attribution-continuation.yml',
            'tests/qualification/fixtures/inspector-installed-constructor-observation.json',
            'tools/intake_inspector_installed_observation.py',
            'tools/probe_inspector_installed_constructor_observation.py',
            'tests/qualification/test_inspector_installed_constructor_observation.py',
        })
        self.assertNotIn('tools/intake_inspector_c1_cost_observation.py',c8.ALLOWED)

    def test_original_actions_artifact_identities_are_closed(self):
        pins=load_module().fixture(ROOT)
        expected={
            'early':(13870957456,35990760,'1ff5d68ea5a5030bd220a4d622f002eae6f6d23cf522c7a92a39bd42e3513a4b'),
            'result':(13871501564,36056086,'ea1eec909925266f0f3a2817192039903c250662116ee504b27d8089270bdd80'),
            'cleanup':(13870288710,303,'5c2c80649dc2289338cc31c87049bff207a04bec8bc272ac8c446c9eca512948'),
        }
        for key,(artifact_id,size,digest) in expected.items():
            row=pins['artifacts'][key]
            self.assertEqual((row['id'],row['bytes'],row['sha256']),(artifact_id,size,digest))
        self.assertEqual(pins['parent']['jobID'],130634842231)
        self.assertEqual(pins['parent']['attempt'],1)

    def test_original_failure_crossjoins_remain_exact(self):
        m=load_module();pins=m.fixture(ROOT);w=pins['wheel'];failure=pins['failure'];identity=pins['producer']['currentInputIdentity']
        producer={'profile':'umf.private-construction-batch-producer/1','source':pins['runtimeSource'],'inputProfile':'installed-canonical/1',
          'wheel':{'path':'/home/runner/work/_temp/inspector-feasibility/wheels/'+w['filename'],'bytes':w['bytes'],'sha256':w['sha256']},
          'nativeMember':w['nativeMember'],'currentInputIdentity':identity}
        payload={'profile':'umf.private-construction-batch-source/1','source':pins['runtimeSource'],'tree':pins['runtimeTree'],
          'cargoLockSHA256':pins['producer']['cargoLockSHA256'],'inputProfile':'installed-canonical/1',
          'resourcePinsSHA256':identity['resourceFixtureSHA256'],'currentInputIdentity':identity,'limits':{'construction':1000000,'perCall':1000000}}
        measurement={'profile':'umf.private-installed-factory-cost/1','actualCandidateSource':pins['runtimeSource'],'wheelSHA256':w['sha256'],
          'nativeSHA256':w['nativeMember']['sha256'],'currentInputIdentity':identity,'maximumWork':1000000,'status':'resource-limited',
          'pairs':[{'case':failure['firstCase'],'carrier':failure['carrier'],'constructor':{'maximumWork':failure['maximumWork'],
          'returnedWork':failure['returnedWork'],'attemptedWork':failure['attemptedWork'],'completed':False}}],
          'requestCustodyPreserved':False,'installedFilesUnchanged':False}
        cost={'profile':'umf.private-retained-cost-gate/1','artifactSource':pins['runtimeSource'],'controllerSource':pins['runtimeSource'],
          'wheelSHA256':w['sha256'],'nativeSHA256':w['nativeMember']['sha256'],'run':str(pins['parent']['id']),'attempt':'1','status':'failed',
          'expensiveTestCompilationAdmitted':False,'classification':'installed-factory-failure-no-explicit-diagnostic'}
        m.verify_failure(pins,measurement,cost,producer,payload)
        measurement['pairs'][0]['constructor']['returnedWork']-=1
        with self.assertRaises(ValueError):m.verify_failure(pins,measurement,cost,producer,payload)

    def test_wrong_source_or_wheel_fails_closed(self):
        m=load_module();raw=json.loads(FIXTURE.read_text())
        for mutate in (lambda p:p.update(runtimeSource='0'*40),
                       lambda p:p['wheel'].update(sha256='0'*64),
                       lambda p:p['stack'].update(symtabEntries=63603)):
            value=json.loads(json.dumps(raw));mutate(value)
            with tempfile.TemporaryDirectory() as td:
                path=Path(td)/m.FIXTURE;path.parent.mkdir(parents=True);path.write_text(json.dumps(value))
                with self.assertRaises((AssertionError,ValueError,KeyError)):
                    m.fixture(Path(td))


    def test_workflow_candidate_route_is_explicit_and_c8_remains_default(self):
        text=(ROOT/'.github/workflows/inspector-attribution-continuation.yml').read_text()
        self.assertNotIn('candidate_01011:',text)
        self.assertIn('admitted:',text)
        self.assertIn('controller_sha:',text)
        self.assertIn('default: false',text)
        self.assertIn("ORIGINAL_OWNER: ${{ github.ref == 'refs/heads/codex/c1-01011-cost-observation' && '7d17f1c50ff79006b1e1a8f5138c5d552c7fc94f' || '67b6dbae9d969f8c7e5eb955e97a312be5f45787' }}",text)
        self.assertIn("if: github.event_name == 'workflow_dispatch' && inputs.admitted == true",text)
        self.assertIn('probe_inspector_installed_constructor_observation.py',text)
        self.assertIn('probe_inspector_c1_cost_observation.py',text)
        self.assertIn('out_name=c1-cost-observation',text)
        self.assertIn('--out "$RUNNER_TEMP/$out_name"',text)


    def test_hosted_probe_is_lazy_and_has_one_observation_call(self):
        source=(ROOT/'tools/probe_inspector_c1_cost_observation.py').read_text()
        import ast
        tree=ast.parse(source)
        module_imports=[node for node in tree.body if isinstance(node,(ast.Import,ast.ImportFrom))]
        imported=[alias.name for node in module_imports for alias in (node.names if isinstance(node,ast.Import) else [])]
        self.assertNotIn('umf',imported)
        self.assertEqual(source.count('observer.observe_once('),1)
        self.assertIn("strictMaximumWork=1000000",source)
        self.assertIn("refs/heads/codex/c1-01011-cost-observation",(ROOT/'tools/intake_inspector_c1_cost_observation.py').read_text())
        self.assertIn('69 derived from the retained single-refusal prefix',source)

    def test_original_baseline_refusal_is_explicitly_derived_and_exact(self):
        spec=importlib.util.spec_from_file_location('c1_probe_baseline',ROOT/'tools/probe_inspector_c1_cost_observation.py')
        probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)
        self.assertEqual(probe.original_baseline(load_module().fixture(ROOT)['failure']),
                         {'acceptedHostWork':999955,'attemptedHostWork':1000024,'refusedCharge':69})
        changed=dict(load_module().fixture(ROOT)['failure']);changed['attemptedWork']+=1
        with self.assertRaises(ValueError):probe.original_baseline(changed)

    def test_static_elf_reader_accepts_one_bounded_symtab_without_loading(self):
        m=load_module();blob=bytearray(64+56+4*64)
        blob[:7]=b'\x7fELF\x02\x01\x01'
        struct.pack_into('<HHIQQQIHHHHHH',blob,16,3,62,1,0,64,120,0,64,56,1,64,4,0)
        # null section, one string table, one static symbol table, one other section
        struct.pack_into('<IIQQQQIIQQ',blob,120+64,0,3,0,0,376,1,0,0,1,0)
        struct.pack_into('<IIQQQQIIQQ',blob,120+128,0,2,0,0,384,24,1,0,8,24)
        struct.pack_into('<IIQQQQIIQQ',blob,120+192,0,1,0,0,0,0,0,0,1,0)
        blob.extend(b'\0'*(408-len(blob)))
        result=m.elf_static_symtab(bytes(blob))
        self.assertEqual((result['ELFtype'],result['ELFmachine'],result['sectionHeaders'],result['symtabEntries']),(3,62,4,1))
        with self.assertRaises(ValueError):m.elf_static_symtab(bytes(blob[:120+4*64]))


class SourceArchiveModeSemantics(unittest.TestCase):
    @staticmethod
    def prepare(root, tracked_mode=0o644, checkout_mode=0o644):
        m=load_module()
        payloads={'src/module.py':b'value = 17\n',m.CENSUS:b'{"profile":"test"}\n'}
        for name,raw in payloads.items():
            path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw);path.chmod(tracked_mode)
        subprocess.run(['git','init','-q',str(root)],check=True)
        subprocess.run(['git','-C',str(root),'config','user.name','Qualification Test'],check=True)
        subprocess.run(['git','-C',str(root),'config','user.email','qualification@example.invalid'],check=True)
        subprocess.run(['git','-C',str(root),'add','--','src/module.py',m.CENSUS],check=True)
        subprocess.run(['git','-C',str(root),'commit','-q','-m','fixture'],check=True)
        for name in payloads:(root/name).chmod(checkout_mode)
        selected={'sourceFiles':{'src/module.py':hashlib.sha256(payloads['src/module.py']).hexdigest()}}
        pins={'producer':{'censusSHA256':hashlib.sha256(payloads[m.CENSUS]).hexdigest()}}
        return m,payloads,selected,pins

    @staticmethod
    def archive(payloads, mode=0o664):
        data=io.BytesIO()
        with tarfile.open(fileobj=data,mode='w:') as tar:
            for name,raw in payloads.items():
                row=tarfile.TarInfo(name);row.size=len(raw);row.mode=mode;tar.addfile(row,io.BytesIO(raw))
        return data.getvalue()

    def test_original_0664_archive_matches_git_100644_and_checkout_0644(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);m,payloads,selected,pins=self.prepare(root)
            self.assertEqual((root/'src/module.py').stat().st_mode & 0o777,0o644)
            tree=subprocess.check_output(['git','-C',str(root),'ls-tree','HEAD','--','src/module.py'],text=True)
            self.assertIn('100644 blob ',tree)
            m.verify_source_tar(self.archive(payloads,0o664),root,selected,pins)

    def test_swapped_archive_and_executable_source_modes_are_refused(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);m,payloads,selected,pins=self.prepare(root)
            with self.assertRaisesRegex(ValueError,'Source archive bytes/mode differ'):
                m.verify_source_tar(self.archive(payloads,0o644),root,selected,pins)
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);m,payloads,selected,pins=self.prepare(root,tracked_mode=0o755)
            with self.assertRaisesRegex(ValueError,'Git mode/type differs'):
                m.verify_source_tar(self.archive(payloads,0o664),root,selected,pins)
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);m,payloads,selected,pins=self.prepare(root,checkout_mode=0o755)
            with self.assertRaisesRegex(ValueError,'regular and non-executable'):
                m.verify_source_tar(self.archive(payloads,0o664),root,selected,pins)


class IdentityEntryDryPath(unittest.TestCase):
    def test_identity_entry_resolves_only_through_stubbed_primitives(self):
        import importlib.metadata
        import os
        import sys
        import types
        from types import SimpleNamespace
        from unittest.mock import patch
        m=load_module();pins=m.fixture(ROOT)
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);owner=root/'owner';out=root/'out';owner.mkdir();out.mkdir()
            wheel=root/'retained.whl';wheel.write_bytes(b'test retained wheel placeholder')
            controller=ROOT
            census_path=owner/'tests/qualification/fixtures/inspector-construction-batch.json'
            census_path.parent.mkdir(parents=True);census_path.write_text('{}')
            identity=pins['producer']['currentInputIdentity']
            (out/'intake.json').write_text(json.dumps({'runtimeSource':pins['runtimeSource'],
              'observerController':'c'*40,'observerRun':'12345','observerAttempt':'1','wheelPath':str(wheel),
              'currentInputIdentity':identity}))
            dependencies={k.lower().replace('_','-'):v for k,v in pins['producer']['dependencies'].items()}
            dependencies['umf-core']='0.10.11'
            install=[{'metadata':{'name':name,'version':version},'download_info':{
              'url':wheel.as_uri(),'archive_info':{'hashes':{'sha256':pins['wheel']['sha256']}}}}
              for name,version in dependencies.items()]
            (out/'install-report.json').write_text(json.dumps({'install':install}))
            for name in ('pip-check.log','freeze.txt'):(out/name).write_text('ok\n')
            platlib=(root/'site-packages').resolve();package=platlib/'umf';package.mkdir(parents=True)
            module_paths={'umf/__init__.py':package/'__init__.py','umf/_rust.py':package/'_rust.py',
              'umf/_rust_core.abi3.so':package/'_rust_core.abi3.so','umf/rust_codegen.py':package/'rust_codegen.py'}
            for path in module_paths.values():path.write_bytes(b'stub')
            dist=SimpleNamespace(version='0.10.11',files=[Path(name) for name in module_paths])
            expected_members={name:'a'*64 for name in module_paths}
            expected_members['umf/_rust_core.abi3.so']=pins['wheel']['nativeMember']['sha256']
            calls={'selection':0,'current_inputs':0,'pip_metadata':0,'installed_wheel':0,'loaded_owner':[],'verify':0}
            helper=SimpleNamespace(CENSUS='tests/qualification/fixtures/inspector-construction-batch.json')
            def selection(owner_path,census):calls['selection']+=1;return object()
            def current_inputs(owner_path,selected):calls['current_inputs']+=1;return ({},identity)
            def installed_wheel(wheel_arg,dist_arg,version):
                calls['installed_wheel']+=1;self.assertEqual((wheel_arg,dist_arg,version),(wheel,dist,'0.10.11'))
                return [{'name':name,'sha256':value} for name,value in expected_members.items()]
            helper.selection=selection;helper.current_inputs=current_inputs;helper.installed_wheel=installed_wheel
            driver=SimpleNamespace()
            def pip_generated_metadata(platlib_arg,wheel_arg,sha_arg,version):
                calls['pip_metadata']+=1;self.assertEqual((platlib_arg,wheel_arg,sha_arg,version),
                  (platlib,wheel,pins['wheel']['sha256'],'0.10.11'))
            def loaded_owner(name,path,base,distribution,owned,sha_arg):
                calls['loaded_owner'].append(name);self.assertEqual((base,distribution,sha_arg),(platlib,dist,expected_members[name]))
                return {'sha256':sha_arg}
            driver.pip_generated_metadata=pip_generated_metadata;driver.loaded_owner=loaded_owner
            def write(path,value):Path(path).write_text(json.dumps(value))
            def fake_load(path,name):
                if name=='c8_identity_helpers':return SimpleNamespace(write=write)
                if name=='candidate_identity_source':return helper
                if name=='candidate_identity_primitives':return driver
                raise AssertionError('Unexpected loaded helper '+name)
            fake_umf=types.ModuleType('umf');fake_umf.__file__=str(module_paths['umf/__init__.py']);fake_umf.__version__='0.10.11'
            fake_modules={}
            for name,path in module_paths.items():
                dotted=name[:-3].replace('/','.') if name.endswith('.py') else 'umf._rust_core'
                mod=types.ModuleType(dotted);mod.__file__=str(path);fake_modules[dotted]=mod
            fake_umf._rust=fake_modules['umf._rust'];fake_umf._rust_core=fake_modules['umf._rust_core']
            fake_umf.rust_codegen=fake_modules['umf.rust_codegen'];fake_modules['umf']=fake_umf
            def run_stub(command,check):
                calls['verify']+=1;self.assertTrue(check)
                receipt=Path(command[command.index('--receipt')+1])
                receipt.write_text(json.dumps({'status':'passed','wheel_sha256':pins['wheel']['sha256'],
                  'native_sha256':pins['wheel']['nativeMember']['sha256']}))
                return SimpleNamespace(returncode=0)
            args=SimpleNamespace(controller=controller,owner=owner,out=out,wheel=wheel,controller_sha='c'*40,
              observer_run='12345',observer_attempt='1')
            real_sha=m.sha
            def sha(path):return pins['wheel']['sha256'] if Path(path)==wheel else real_sha(path)
            with patch.object(m,'load',side_effect=fake_load),patch.object(m,'sha',side_effect=sha),\
                 patch.object(m.subprocess,'run',side_effect=run_stub),\
                 patch.object(importlib.metadata,'distribution',return_value=dist),\
                 patch('sysconfig.get_path',return_value=str(platlib)),\
                 patch('platform.python_version',return_value='3.11.17'),patch('platform.system',return_value='Linux'),\
                 patch('platform.machine',return_value='x86_64'),patch.dict(sys.modules,fake_modules):
                m.identity(args,'before')
            receipt=json.loads((out/'identity-before.json').read_text())
            self.assertTrue(receipt['completeWheelAndInstalledRecordVerified'])
            self.assertTrue(receipt['distributionOwnershipVerified'])
            self.assertEqual(calls,{'selection':1,'current_inputs':1,'pip_metadata':1,'installed_wheel':1,
              'loaded_owner':list(module_paths),'verify':1})

if __name__=='__main__':unittest.main()
