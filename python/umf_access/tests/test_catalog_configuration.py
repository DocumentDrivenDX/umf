# SPDX-License-Identifier: MIT OR Apache-2.0
"""Explicit source custody precedes declaration imports or compiler calls."""

import hashlib
import json
import tempfile
import unittest
from copy import deepcopy
from importlib.metadata import PackageNotFoundError
from pathlib import Path
from unittest.mock import patch

from umf_access.build.catalog import CatalogBuildError, resolve_configuration


class ConfigurationTests(unittest.TestCase):
 def _source_pinned_configuration(self, root, distribution):
  model='{"original":"preserved"}\n';(root/'model.json').write_text(model)
  binding=json.dumps({'modelJson':model});(root/'binding.json').write_text(binding)
  def pin(name):return {'path':name,'sha256':hashlib.sha256((root/name).read_bytes()).hexdigest()}
  return {'package':'shop','modules':['declarations'],'targets':[{'bindingSource':pin('binding.json')}],'weft':{'distribution':distribution,'version':'exact'},'umf':{'documents':[pin('model.json')]}},model

 def test_pins_original_bytes_and_distribution_before_capture(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);model='{"original":"preserved"}\n';(root/'model.json').write_text(model)
   binding=json.dumps({'modelJson':model});(root/'binding.json').write_text(binding)
   def pin(name):return {'path':name,'sha256':hashlib.sha256((root/name).read_bytes()).hexdigest()}
   config={'package':'shop','modules':['declarations'],'targets':[{'bindingSource':pin('binding.json')}],'weft':{'distribution':'weft-sql','version':'exact'},'umf':{'documents':[pin('model.json')]}}
   with patch('importlib.metadata.version',return_value='exact'):
    resolved,provenance=resolve_configuration(config,root)
    self.assertEqual(resolved['targets'][0]['binding']['modelJson'],model)
    self.assertIn('bindingSource',config['targets'][0]);self.assertEqual(len(provenance['sources']),2)
    (root/'model.json').write_text(model+' ')
    with self.assertRaises(CatalogBuildError):resolve_configuration(config,root)
   with patch('importlib.metadata.version',return_value='different'):  # noqa: SIM117 -- Keep transaction and refusal/cleanup scopes explicit.
    with self.assertRaises(CatalogBuildError):resolve_configuration(config,root)

 def test_both_explicit_distribution_names_bind_exact_source_and_provenance(self):
  for distribution in ('weft-sql','umf-weft'):
   with self.subTest(distribution=distribution),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);config,model=self._source_pinned_configuration(root,distribution);original=deepcopy(config)
    with patch('importlib.metadata.version',return_value='exact') as installed_version:
     resolved,provenance=resolve_configuration(config,root)
    self.assertEqual(resolved['targets'][0]['binding'],{'modelJson':model})
    self.assertEqual(provenance['sources'],[config['umf']['documents'][0],config['targets'][0]['bindingSource']])
    self.assertEqual(provenance['weft'],{'distribution':distribution,'version':'exact'})
    self.assertEqual(config,original)
    installed_version.assert_called_once_with(distribution)

 def test_selected_distribution_version_mismatch_never_falls_back(self):
  for selected in ('weft-sql','umf-weft'):
   other='umf-weft' if selected=='weft-sql' else 'weft-sql'
   with self.subTest(selected=selected),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);config,_=self._source_pinned_configuration(root,selected)
    def installed_version(name, selected=selected, other=other):return 'wrong' if name==selected else 'exact' if name==other else 'unexpected'
    with patch('importlib.metadata.version',side_effect=installed_version) as metadata_version:
     with self.assertRaises(CatalogBuildError):resolve_configuration(config,root)
    metadata_version.assert_called_once_with(selected)

 def test_selected_distribution_absence_never_falls_back(self):
  for selected in ('weft-sql','umf-weft'):
   other='umf-weft' if selected=='weft-sql' else 'weft-sql'
   with self.subTest(selected=selected),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);config,_=self._source_pinned_configuration(root,selected)
    def installed_version(name, selected=selected, other=other):
     if name==selected:raise PackageNotFoundError(selected)
     return 'exact' if name==other else 'unexpected'
    with patch('importlib.metadata.version',side_effect=installed_version) as metadata_version:
     with self.assertRaises(PackageNotFoundError):resolve_configuration(config,root)
    metadata_version.assert_called_once_with(selected)

 def test_noncanonical_distribution_selections_refuse_before_metadata_lookup(self):
  invalid_pins=(
   {'distribution':'unrelated','version':'exact'},
   {'distribution':'umf_weft','version':'exact'},
   {'distribution':'UMF-WEFT','version':'exact'},
   {'version':'exact'},
   {'distribution':'weft-sql','version':'exact','extra':True},
   {'distribution':['umf-weft'],'version':'exact'},
   {},
  )
  for pin in invalid_pins:
   with self.subTest(pin=pin),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);config,_=self._source_pinned_configuration(root,'weft-sql');config['weft']=pin
    with patch('importlib.metadata.version',return_value='exact') as metadata_version:
     with self.assertRaises(CatalogBuildError):resolve_configuration(config,root)
    metadata_version.assert_not_called()

 def test_unsafe_sources_and_unexpected_configuration_refuse(self):
  with self.assertRaises(CatalogBuildError):resolve_configuration({'package':'shop','modules':[],'targets':[],'guess':True},Path('.'))


class CapturedCatalogSources(unittest.TestCase):
 def fixture(self, root, function, target_binding):
  """Real capture/compiler/catalog path with a minimal generated package surface."""
  import types

  from pydantic import create_model
  from test_reviewed_reads import ORDER, SOURCE, objects, order_id
  from umf_access.types import RUNTIME_IDENTITY, StrictModel
  package=types.ModuleType('source_catalog');package.__path__=[]
  models=types.ModuleType('source_catalog.models');keys=types.ModuleType('source_catalog.keys')
  record=create_model('Order',__base__=StrictModel,id=(int,...))
  for name,value in {'objects':objects,'c':types.SimpleNamespace(id=order_id),'UMF_SOURCE':SOURCE,'UMF_BUNDLE_INPUT_DIGEST':SOURCE.input_digest,'UMF_RUNTIME_ABI':RUNTIME_IDENTITY}.items():
   type.__setattr__(record,name,value)
  self.assertEqual(record.objects.ref,ORDER)
  models.Order=package.Order=record;keys.BUNDLE_INPUT_DIGEST=SOURCE.input_digest
  declaration=types.ModuleType('source_declarations');declaration.__file__=str(root/'source_declarations.py')
  (root/'source_declarations.py').write_text('# explicit trusted test declaration\n')
  function.__module__='source_declarations';declaration.read=function
  directory=root/'source_catalog'/'_umf';directory.mkdir(parents=True)
  # Retain the actual authored physical document in this explicit unit fixture;
  # native source checking must run before capture even for the minimal package.
  sources=[{'id':item['binding']['sourceId'],'text':item['binding']['documentJson']} for item in target_binding['nativeColumns']['sets']]
  source_bytes=json.dumps(sources).encode();(directory/'sources.json').write_bytes(source_bytes)
  inventory=[{'path':'source_catalog/_umf/sources.json','sha256':hashlib.sha256(source_bytes).hexdigest()}]
  (directory/'manifest.json').write_text(json.dumps({'runtimeAbi':dict(zip(('distribution','version','abi'),RUNTIME_IDENTITY,strict=True)),'inputDigest':SOURCE.input_digest,'inventory':inventory,'symbols':[]}))
  return {'source_catalog':package,'source_catalog.models':models,'source_catalog.keys':keys,'source_declarations':declaration}

 def compile(self, root, function, compiler, target_binding=None):
  import sys

  from test_reviewed_reads import binding
  from umf_access.build.catalog import compile_catalog
  config={'package':'source_catalog','modules':['source_declarations'],'targets':[{'id':'pg','kind':'postgresql','backendId':'pg','backendVersion':'18','targetProfile':'postgresql18','binding':target_binding or binding(),'platform':[],'nativeActions':[]}]}
  modules=self.fixture(root,function,config['targets'][0]['binding'])
  old_path=list(sys.path)
  try:
   with patch.dict(sys.modules,modules):
    output=compile_catalog(config,root,compiler)
    namespace={'__name__':'source_catalog.queries','__package__':'source_catalog'}
    exec(compile(output['queries.py'],'generated queries','exec'),namespace)  # noqa: S102 -- Exercise the actual generated fixture module on reload.
    entries=[v for k,v in namespace.items() if k.startswith('_Q') and hasattr(v,'variants')]
    self.assertTrue(entries)
    for plan in entries:
     for variant in plan.variants:
      self.assertEqual(variant.entry.artifact()['generatedSource']['input_digest'],modules['source_catalog'].Order.UMF_SOURCE.input_digest)
    return output
  finally:sys.path[:]=old_path

 def test_count_and_dynamic_tuple_retain_source_after_catalog_serialization(self):
  from test_reviewed_reads import Compiler, objects, order_id
  from umf_access.dsl import query
  @query
  def count():return objects.count()
  @query
  def selected():return objects.select(order_id).limit(3).all()
  for function in (count,selected):
   with self.subTest(function=function),tempfile.TemporaryDirectory() as tmp:
    self.compile(Path(tmp),function,Compiler())

 def test_stale_root_mixed_join_field_and_target_refuse_before_compiler(self):
  from dataclasses import replace

  from test_reviewed_reads import (
   CUSTOMER_REL,
   ORDER,
   SOURCE,
   binding,
   objects,
   order_id,
  )
  from umf_access.dsl import Column, Query, query
  from umf_access.reviewed import ReadBuildError
  class NeverCompile:
   def compile_raw_read_json(self,request):raise AssertionError('stale capture reached compiler')
  stale=Query(replace(ORDER,source=replace(SOURCE,input_digest='b'*64)))
  mixed=replace(CUSTOMER_REL,target=replace(CUSTOMER_REL.target,source=replace(SOURCE,input_digest='b'*64)))
  foreign=Column(replace(ORDER.key[0],source=replace(SOURCE,input_digest='b'*64)))
  @query
  def stale_count():return stale.count()
  @query
  def mixed_count():return objects.join(mixed).count()
  @query
  def mixed_selected():return objects.select(foreign).limit(3).all()
  @query
  def valid_selected():return objects.select(order_id).limit(3).all()
  altered=binding();altered['modelJson']+=' '
  for function,target in ((stale_count,None),(mixed_count,None),(mixed_selected,None),(valid_selected,altered)):
   with self.subTest(function=function),tempfile.TemporaryDirectory() as tmp,self.assertRaisesRegex(ReadBuildError,'CATALOG_STALE'):
    self.compile(Path(tmp),function,NeverCompile(),target)
