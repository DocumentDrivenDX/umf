"""Pure source controls for the gated retained-wheel diagnostic route."""
import importlib.util
import json
from pathlib import Path
import struct
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
        self.assertEqual((pins['failure']['returnedWork'],pins['failure']['attemptedWork']),(999990,1000013))
        self.assertEqual(pins['failure']['maximumWork'],1000000)
        self.assertEqual(pins['stack']['nativeBytes'],58468352)
        self.assertEqual(pins['stack']['nativeSHA256'],'6c4dc4913fb3b59f301e208970fcbd04beeb5c9f73b82ffb1a5917fd19518db6')
        self.assertEqual((pins['stack']['sectionHeaders'],pins['stack']['symtabEntries'],pins['stack']['symtabBytes']),(33,63604,1526496))
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
            'early':(13834443887,35576977,'e34ad5a553b08ae81fbfdc6d70535f920a4822157ad582cef8c74cf90bcee32b'),
            'result':(13835082083,35640804,'be4ebb3f941741efd4945aad988c938e46c15230ca2c743d2ade78196a8412f4'),
            'cleanup':(13834633369,303,'64f2c25337100f75cc146dec656a083687eb973ff4aa0f042abfe257dd25b744'),
        }
        for key,(artifact_id,size,digest) in expected.items():
            row=pins['artifacts'][key]
            self.assertEqual((row['id'],row['bytes'],row['sha256']),(artifact_id,size,digest))
        self.assertEqual(pins['parent']['jobID'],130367654293)
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
        self.assertIn("ORIGINAL_OWNER: ${{ github.ref == 'refs/heads/codex/c1-01011-cost-observation' && '7cafb8d28b83a7a949f73f362b43253fb08cbce1' || '67b6dbae9d969f8c7e5eb955e97a312be5f45787' }}",text)
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
        self.assertIn('23 derived from the retained single-refusal prefix',source)

    def test_original_baseline_refusal_is_explicitly_derived_and_exact(self):
        spec=importlib.util.spec_from_file_location('c1_probe_baseline',ROOT/'tools/probe_inspector_c1_cost_observation.py')
        probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)
        self.assertEqual(probe.original_baseline(load_module().fixture(ROOT)['failure']),
                         {'acceptedHostWork':999990,'attemptedHostWork':1000013,'refusedCharge':23})
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

if __name__=='__main__':unittest.main()
