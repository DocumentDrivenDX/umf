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

    def test_exact229_and47_sources_and_kepler_hashes_are_closed(self):
        selected=batch.authenticate_lists(self.census,self.executables,self.listings)
        self.assertEqual(len(selected),229);self.assertEqual(len(set(selected)),229)
        self.assertEqual(sum(len(g['cases']) for g in self.census['python']),47)
        expected={'context':'a7081434d41db02a5b785ab172374e124e8ffa4539e367d0ab46da4200dc82fc',
          'schema':'b6bae4b8d8927eee3b5b64112bdaebe144602966c602ee01ca545657852161e6',
          'registry':'f8e98b8b75ca3fc09cb19c0da052a4f83062edf29e1d0e7139197c2045f3683d'}
        for module,digest in expected.items():
            self.assertEqual(batch.sha(ROOT/'crates/umf-core/src'/f'{module}_construction_tests.rs'),digest)
        helper=batch.load(ROOT/'tools/probe_inspector_installed_factory.py','frozen_factory_source')
        self.assertEqual(helper.digest(helper.original_loader((ROOT/helper.LOADER).read_bytes())),batch.TEST_SHA)
        selected=helper.selection(ROOT,self.census)
        self.assertEqual(helper.verified_loader_sha(ROOT),selected['sourceFiles'][helper.LOADER])
        self.assertEqual(self.census['installedFactory']['status'],'source-frozen')
        # Historical pins retain their original source scope; no relabel.
        self.assertTrue(any(batch.sha(ROOT/name)!=digest for name,digest in self.census['fileHashes'].items()))

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
        self.assertEqual(len(batch.authenticate_lists(self.census,self.executables,self.listings)),229)

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



    def test_current415_existing_targets_and_compiled_lists_are_exact(self):
        helper=batch.load(ROOT/'tools/probe_inspector_installed_factory.py','frozen_list_controls')
        v=helper.selection(ROOT,self.census);current={**self.census,'rust':v['rust'],'rustCaseCount':sum(len(g['cases']) for g in v['rust'])}
        listings={key:[] for key in self.keys}
        for row in current['rust']:listings[row['package'],row['target']]+=[x['name'] for x in row['cases']]
        self.assertEqual(len(batch.authenticate_lists(current,self.executables,listings)),433)
        self.assertEqual({(g['package'],g['target']) for g in current['rust']},self.keys)
        for row in current['rust']:
            if row['package']=='umf-core-python':self.assertEqual(row['manifest'],'bindings/core/python/Cargo.toml')
        for kind in ('missing','duplicate','extra-selected-module','foreign-target'):
            bad={k:list(names) for k,names in listings.items()};key=('umf-core-wire','lib')
            factory=next(n for n in bad[key] if n.startswith('installed_codegen_factory_independent_tests::'))
            if kind=='missing':bad[key].remove(factory)
            elif kind=='duplicate':bad[key].append(factory)
            elif kind=='extra-selected-module':bad[key].append('installed_codegen_factory_independent_tests::unreviewed')
            else:bad[('umf-core','test:unselected')]=['unreviewed']
            with self.subTest(kind=kind),self.assertRaises(ValueError):batch.authenticate_lists(current,self.executables,bad)

if __name__=='__main__':unittest.main()
