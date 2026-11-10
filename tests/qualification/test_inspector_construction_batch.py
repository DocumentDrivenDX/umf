"""Pure source/census controls. Never import UMF or execute Cargo/test binaries."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
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

    def test_historical229_and47_sources_remain_closed_candidate_binding_is_authenticated(self):
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
        candidate,identity=helper.current_inputs(ROOT,selected)
        self.assertEqual(selected['currentInputs']['fixturePath'],helper.CANDIDATE_FIXTURE)
        self.assertEqual(selected['currentInputs']['metadataVersion'],'0.10.10')
        self.assertEqual(candidate['candidateArtifactVersion'],'0.10.10')
        self.assertEqual((candidate['generation']['sourceCommit'],candidate['generation']['sourceTree']),('0eab4efe63eb909f5a2be84ca69f99385885580a','a636d335f7126295920c3831e7bb100e0f41ed31'))
        self.assertEqual(helper.input_metadata_version(identity),'0.10.10')
        wrong_metadata=copy.deepcopy(selected)
        wrong_metadata['currentInputs']['metadataVersion']='0.10.9'
        with self.assertRaisesRegex(ValueError,'Candidate artifact version differs'):
            helper.current_inputs(ROOT,wrong_metadata)
        self.assertEqual(helper.verified_loader_sha(ROOT),self.census['installedFactory']['sourceFiles'][helper.LOADER])
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



    def test_current485_expected_targets_and_compiled_lists_are_exact(self):
        helper=batch.load(ROOT/'tools/probe_inspector_installed_factory.py','frozen_list_controls')
        v=self.census['installedFactory'];current={**self.census,'rust':v['rust'],'rustCaseCount':sum(len(g['cases']) for g in v['rust'])}
        listings={key:[] for key in self.keys}
        for row in current['rust']:listings[row['package'],row['target']]+=[x['name'] for x in row['cases']]
        self.assertEqual(len(batch.authenticate_lists(current,self.executables,listings)),485)
        self.assertEqual({(g['package'],g['target']) for g in current['rust']},self.keys)
        for row in current['rust']:
            if row['package']=='umf-core-python':self.assertEqual(row['manifest'],'bindings/core/python/Cargo.toml')
        expected_added={
            'value::owned_core_json_independent_tests::storage_text_copy_preserves_all_storage_kinds_without_new_input_admission',
            'schema::codegen_catalogue_independent_tests::prepared_export_is_shared_only_with_actual_owner_operation_and_lifetime',
            'schema::codegen_catalogue_independent_tests::prepared_builder_does_not_confer_schema_success_or_accept_incomplete_protocol',
            'schema::codegen_catalogue_independent_tests::failed_table_export_cannot_retry_or_publish_a_receipt',
            'resources::codegen_catalogue_independent_tests::paid_storage_copy_is_not_current_limit_readmission_and_stops_at_each_denial',
            'resources::codegen_catalogue_independent_tests::snapshot_insert_unique_shared_denial_and_public_deep_clone_are_isolated',
            'resources::codegen_catalogue_independent_tests::saga_two_insertions_are_isolated_and_old_core_limits_still_refuse_in_compiler',
            'actions::saga::tests::cloned_saga_resources_keep_original_snapshot_and_noop_or_invalid_installation'}
        added=[(row['package'],row['target'],row['features'],case['name']) for row in v['rust'] for case in row['cases'] if case['name'] in expected_added]
        self.assertEqual({name for _,_,_,name in added},expected_added)
        self.assertEqual(len(added),8)
        all_cases=[case for row in v['rust'] for case in row['cases']]
        original=[case for row in v['rust'] for case in row['cases'] if case['name'] not in expected_added]
        import hashlib,json
        digest=lambda values:hashlib.sha256(json.dumps(values,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode()).hexdigest()
        self.assertEqual(len(original),477)
        self.assertEqual(digest(original),'d67154ed194c734a2fc7b3101fe9a4c65fa550a1f2b5d854cd74a022542b33ad')
        selected=helper.selection(ROOT,self.census)
        candidate,identity=helper.current_inputs(ROOT,selected)
        self.assertEqual(helper.input_metadata_version(identity),'0.10.10')
        self.assertEqual(candidate['candidateArtifactVersion'],'0.10.10')
        mixed_authority={**identity,'inheritedPrivateMetadataVersion':'0.10.9'}
        with self.assertRaisesRegex(ValueError,'Ambiguous or unknown current-input version authority'):
            helper.input_metadata_version(mixed_authority)
        legacy_source=copy.deepcopy(selected)
        legacy_source['currentInputs']={'fixturePath':helper.CURRENT_FIXTURE,
          'fixtureSHA256':helper.sha(ROOT/'tests/qualification/fixtures/inspector-installed-current-resources.json'),
          'metadataVersion':'0.10.10'}
        with self.assertRaisesRegex(ValueError,'Exact inherited private metadata differs'):
            helper.current_inputs(ROOT,legacy_source)
        for kind in ('missing','duplicate','extra-selected-module','foreign-target'):
            bad={k:list(names) for k,names in listings.items()};key=('umf-core-wire','lib')
            factory=next(n for n in bad[key] if n.startswith('installed_codegen_factory_independent_tests::'))
            if kind=='missing':bad[key].remove(factory)
            elif kind=='duplicate':bad[key].append(factory)
            elif kind=='extra-selected-module':bad[key].append('installed_codegen_factory_independent_tests::unreviewed')
            else:bad[('umf-core','test:unselected')]=['unreviewed']
            with self.subTest(kind=kind),self.assertRaises(ValueError):batch.authenticate_lists(current,self.executables,bad)

    def _copy_closed_source_to(self,helper,selected,destination):
        for name in selected['sourceFiles']:
            source=ROOT/name;target=destination/name
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(source,target)

    def _metadata_overlay_refuses(self,helper,source_path,before,after,reason):
        selected=helper.selection(ROOT,self.census)
        with tempfile.TemporaryDirectory(prefix='c1-candidate-metadata-overlay-') as temp:
            overlay=Path(temp);self._copy_closed_source_to(helper,selected,overlay)
            target=overlay/source_path;raw=target.read_bytes()
            self.assertEqual(raw.count(before),1,source_path)
            target.write_bytes(raw.replace(before,after))
            synthetic_census=copy.deepcopy(self.census)
            synthetic=synthetic_census['installedFactory']
            synthetic['sourceFiles'][source_path]=helper.sha(target)
            closure={k:synthetic[k] for k in ('sourceFiles','moduleGraph','rust','python','publicControls','coverage','modelSHA256','legacyDisposition','currentInputs')}
            synthetic['closureSHA256']=helper.digest(helper.canonical(closure))
            self.assertEqual(len(synthetic['sourceFiles']),179)
            with self.assertRaisesRegex(ValueError,reason):
                helper.selection(overlay,synthetic_census)

    def test_actual_candidate_metadata_byte_overlays_reach_real_guards(self):
        helper=batch.load(ROOT/'tools/probe_inspector_installed_factory.py','candidate_metadata_overlays')
        cases=[
          ('python/pyproject.toml',b'name = "umf-core"',b'name = "other-package"','Assembled candidate pyproject metadata differs'),
          ('python/pyproject.toml',b'version = "0.10.10"',b'version = "0.10.9"','Assembled candidate pyproject metadata differs'),
          ('python/src/umf/__init__.py',b'__version__ = "0.10.10"',b'__version__ = "0.10.9"','Assembled candidate package metadata differs')]
        for path,before,after,reason in cases:
            with self.subTest(path=path,before=before):
                self._metadata_overlay_refuses(helper,path,before,after,reason)

    def test_candidate_fixture_substituted_bytes_refuse_without_changing_production_pin(self):
        helper=batch.load(ROOT/'tools/probe_inspector_installed_factory.py','candidate_fixture_substitution')
        selected=helper.selection(ROOT,self.census);path=helper.CANDIDATE_FIXTURE
        expected=self.census['installedFactory']['sourceFiles'][path]
        self.assertEqual(selected['sourceFiles'][path],expected)
        with tempfile.TemporaryDirectory(prefix='c1-candidate-source-pin-substitution-') as temp:
            overlay=Path(temp);self._copy_closed_source_to(helper,selected,overlay)
            substituted=overlay/path;substituted.write_bytes(substituted.read_bytes()+b'\n')
            self.assertNotEqual(helper.sha(substituted),expected)
            self.assertEqual(self.census['installedFactory']['sourceFiles'][path],expected)
            with self.assertRaises(ValueError) as refusal:
                helper.selection(overlay,self.census)
            self.assertEqual(str(refusal.exception),'Factory source pin differs: '+path)

if __name__=='__main__':unittest.main()
