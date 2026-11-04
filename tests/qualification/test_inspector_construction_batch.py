"""Pure source/census controls. Never import UMF or execute Cargo/test binaries."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('batch_controller',ROOT/'tools/qualify_inspector_construction_batch.py')
batch=importlib.util.module_from_spec(spec);spec.loader.exec_module(batch)


class ConstructionBatchSourceControls(unittest.TestCase):
    def setUp(self):
        self.census=json.loads((ROOT/batch.CENSUS).read_text())
        self.keys={(r['package'],r['target']) for r in self.census['rust']}
        self.executables={key:Path('/NOT_EXECUTED/'+str(i)) for i,key in enumerate(sorted(self.keys))}
        self.listings={key:[] for key in self.keys}
        for row in self.census['rust']:
            self.listings[(row['package'],row['target'])] += [c['name'] for c in row['cases']]

    def test_exact214_and47_sources_and_kepler_hashes_are_closed(self):
        selected=batch.authenticate_lists(self.census,self.executables,self.listings)
        self.assertEqual(len(selected),214);self.assertEqual(len(set(selected)),214)
        self.assertEqual(sum(len(g['cases']) for g in self.census['python']),47)
        expected={'context':'a7081434d41db02a5b785ab172374e124e8ffa4539e367d0ab46da4200dc82fc',
          'schema':'b6bae4b8d8927eee3b5b64112bdaebe144602966c602ee01ca545657852161e6',
          'registry':'f8e98b8b75ca3fc09cb19c0da052a4f83062edf29e1d0e7139197c2045f3683d'}
        for module,digest in expected.items():
            self.assertEqual(batch.sha(ROOT/'crates/umf-core/src'/f'{module}_construction_tests.rs'),digest)
        self.assertEqual(batch.sha(ROOT/'python/tests/test_retained_codegen_native.py'),batch.TEST_SHA)
        for name,digest in self.census['fileHashes'].items():self.assertEqual(batch.sha(ROOT/name),digest,name)

    def test_compiled_census_refuses_missing_duplicate_extra_and_zero_selections(self):
        key=next(iter(self.keys))
        for mutation in ('missing','duplicate','extra-selected-module','zero'):
            with self.subTest(mutation=mutation):
                listings={k:list(v) for k,v in self.listings.items()}
                if mutation=='missing':listings[key].pop()
                elif mutation=='duplicate':listings[key].append(listings[key][0])
                elif mutation=='extra-selected-module':listings[key].append(listings[key][0].rsplit('::',1)[0]+'::unapproved')
                else:listings[key]=[]
                with self.assertRaises(ValueError):batch.authenticate_lists(self.census,self.executables,listings)
        # Other compiled modules are not qualification selection or execution.
        lib=next(k for k in self.keys if k[1]=='lib')
        self.listings[lib].append('unselected_module::not_executed')
        self.assertEqual(len(batch.authenticate_lists(self.census,self.executables,self.listings)),214)

    def test_compiled_target_must_belong_to_exact_workspace_and_be_unambiguous(self):
        metadata={'workspace_root':'/OWNED','packages':[{'name':p,'id':'id:'+p,'manifest_path':'/OWNED/'+next(r.get('manifest','crates/'+p+'/Cargo.toml') for r in self.census['rust'] if r['package']==p)} for p in sorted({k[0] for k in self.keys})]}
        events=[]
        for index,(package,target) in enumerate(sorted(self.keys)):
            events.append({'reason':'compiler-artifact','profile':{'test':True},'package_id':'id:'+package,
                'target':{'kind':(['cdylib'] if package=='umf-core-python' else ['lib']) if target=='lib' else ['test'],'name':('_rust_core' if package=='umf-core-python' else package.replace('-','_')) if target=='lib' else target[5:]},'executable':'/NOT_EXECUTED/'+str(index)})
        self.assertEqual(set(batch.select_executables(self.census,metadata,events)),self.keys)
        foreign=json.loads(json.dumps(metadata));foreign['packages'][0]['manifest_path']='/FOREIGN/Cargo.toml'
        with self.assertRaises((KeyError,ValueError)):batch.select_executables(self.census,foreign,events)
        ambiguous=json.loads(json.dumps(events));ambiguous.append(dict(events[0],executable='/NOT_EXECUTED/ambiguous'))
        with self.assertRaises(ValueError):batch.select_executables(self.census,metadata,ambiguous)
        with self.assertRaises(ValueError):batch.select_executables(self.census,metadata,[])


if __name__=='__main__':unittest.main()
