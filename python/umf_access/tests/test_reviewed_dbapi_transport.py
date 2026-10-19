# SPDX-License-Identifier: MIT OR Apache-2.0
"""Actual read compilation plus old/new catalog transport integrity controls.

Synthetic old-format variants remove only additive transport members and reseal
the original real compiler program. These tests do not qualify native execution.
"""
from __future__ import annotations

import copy
import hashlib
import json
import unittest
from unittest.mock import patch

from test_reviewed_reads import TOTAL_SQL, Compiler, Minimum, Totals
from umf_access.reviewed import (
    CatalogRead,
    ReadBuildError,
    ReviewedSQL,
    _dbapi,
    _dbapi_order,
    _json,
)


def seal(program):
    body={key:value for key,value in program.items() if key!='structuralDigest'}
    program['structuralDigest']=hashlib.sha256(_json(body).encode()).hexdigest()
    return program


def binding():
    """Independently authored legacy source-exact fixture, never relabeled0.10.

    Core0.10 source-exact ColumnSet admission is a separate known compiler gap;
    this packet tests the existing0.8 wire and its sealed transport successor.
    """
    ref=lambda field:{'module':'commerce','element':field}
    fields=[('id','integer','bigint'),('status','string','text'),('amount','decimal','numeric(28,6)')]
    elements=[{'id':name,'name':name,'kind':'field','scalarType':carrier,'cardinality':'one','nullability':'required','extensions':{},**({'facets':{'integerWidth':{'bits':64,'signed':True}}} if carrier=='integer' else {'facets':{'precision':28,'scale':6}} if carrier=='decimal' else {})} for name,carrier,_ in fields]
    elements.append({'id':'Order','name':'Order','kind':'record','members':[ref(name) for name,_,_ in fields],'keys':[{'id':'primary','name':'primary','primary':True,'fields':[ref('id')]}],'extensions':{}})
    physical={'umf':'0.8.0','id':'transport-core08-physical','vocabularies':{'umf.binding':{'version':'0.2.0'}},'modules':[],'extensions':{'umf.binding':{'profile':'umf-binding-2','logical':{'documentId':'transport-core08-model','coreVersion':'0.8.0'},'target':{'system':'postgresql','version':'18','subset':'typed-access-columns/0.1'},'elements':[{'module':'commerce','element':'Order','table':'orders'}],'fields':[{'module':'commerce','element':name,'storage':'column','column':name} for name,_,_ in fields],'relationships':[],'indexes':[]}}}
    target={'platform':'postgresql','majorVersion':'18'}
    access={'views':[{'record':ref('Order'),'selectedKey':{**ref('Order'),'key':'primary'},'fields':[{'field':ref(name),'row':{'missing':False,'null':False},'create':{'missing':False,'null':False},'mutable':name!='id','generated':False} for name,_,_ in fields]}],'columns':[{'binding':{'sourceId':physical['id'],'module':'commerce'},'target':target,'columns':[{'field':ref(name),'type':native,'notNull':True,'generation':None,'collation':{'schema':'pg_catalog','name':'default'} if carrier=='string' else None} for name,carrier,native in fields]}]}
    model={'umf':'0.8.0','id':'transport-core08-model','vocabularies':{'umf.access':{'version':'0.1.0'}},'modules':[{'id':'commerce','namespace':'commerce','elements':elements,'relationships':[],'extensions':{'umf.access':access}}]}
    model_json=_json(model);physical_json=_json(physical);digest=hashlib.sha256(model_json.encode()).hexdigest()
    return {'version':'umf.raw-read-binding/0.1','schema':None,'modelJson':model_json,'modelSha256':digest,'tables':[{'logical':['commerce','Order'],'native':'orders','key':['id'],'columns':[{'logical':name,'native':name,'carrier':carrier,'nullable':False} for name,carrier,_ in fields]}],'relationships':[],'nativeColumns':{'target':target,'sets':[{'columnSet':{'documentId':model['id'],'coreVersion':'0.8.0','documentSha256':digest,'module':'commerce','pointer':'/modules/0/extensions/umf.access/columns/0'},'binding':{'sourceId':physical['id'],'documentJson':physical_json,'documentSha256':hashlib.sha256(physical_json.encode()).hexdigest()}}]}}


class FrozenCompiler:
    def __init__(self, program):
        self.program=copy.deepcopy(program)

    def compile_raw_read_json(self, request):
        return _json(self.program)


class ReviewedTransport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class Recording(Compiler):
            def compile_raw_read_json(self, request):
                response=super().compile_raw_read_json(request)
                self.program=json.loads(response)
                return response
        compiler=Recording()
        ReviewedSQL(TOTAL_SQL,Minimum,Totals,10).build(compiler,target='postgresql18',binding=binding())
        cls.original=compiler.program
        cls.legacy=copy.deepcopy(cls.original)
        cls.legacy.pop('dbapiSql',None);cls.legacy.pop('dbapiParameterOrder',None)
        seal(cls.legacy)
        cls.sealed=copy.deepcopy(cls.original)
        # Older installed compiler cohorts can exercise the sealed-format
        # integrity controls too, without being claimed as a native new emitter.
        if 'dbapiSql' not in cls.sealed:
            cls.sealed['dbapiSql']=_dbapi(cls.sealed['sql'])
            cls.sealed['dbapiParameterOrder']=_dbapi_order(cls.sealed['sql'],cls.sealed['parameterOrder'])
            seal(cls.sealed)

    def build(self,program):
        return ReviewedSQL(TOTAL_SQL,Minimum,Totals,10).build(FrozenCompiler(program),target='postgresql18',binding=binding())

    def test_sealed_transport_is_preserved_without_sdk_sql_reinterpretation(self):
        with patch('umf_access.reviewed._dbapi',side_effect=AssertionError('sealed SQL must not be rebuilt')),patch('umf_access.reviewed._dbapi_order',side_effect=AssertionError('sealed slots must not be rebuilt')):
            entry=self.build(self.sealed)
            actual=entry.artifact()
            self.assertEqual(actual['dbapiSql'],self.sealed['dbapiSql'])
            self.assertEqual(actual['dbapiParameterOrder'],self.sealed['dbapiParameterOrder'])
            self.assertEqual(actual['structuralDigest'],self.sealed['structuralDigest'])

    def test_legacy_compiler_and_checked_in_catalog_keep_existing_transport_abi(self):
        entry=self.build(self.legacy)
        artifact=entry.artifact()
        self.assertEqual(artifact['dbapiSql'],_dbapi(self.legacy['sql']))
        self.assertEqual(artifact['dbapiParameterOrder'],_dbapi_order(self.legacy['sql'],self.legacy['parameterOrder']))
        self.assertEqual(CatalogRead(entry.artifact_json,Minimum,Totals).artifact(),artifact)

    def test_build_rejects_unsealed_partial_and_malformed_compiler_transport(self):
        for mutation in ('unsealed','partial','sql-type','unknown-slot','order-type'):
            with self.subTest(mutation=mutation):
                program=copy.deepcopy(self.sealed)
                if mutation=='unsealed':program['structuralDigest']=self.legacy['structuralDigest']
                elif mutation=='partial':program.pop('dbapiParameterOrder');seal(program)
                elif mutation=='sql-type':program['dbapiSql']=None;seal(program)
                elif mutation=='unknown-slot':program['dbapiParameterOrder']=['not-a-compiler-parameter'];seal(program)
                else:program['dbapiParameterOrder']='minimum';seal(program)
                with self.assertRaises(ReadBuildError):self.build(program)

    def test_catalog_transport_tampering_refuses_even_when_outer_catalog_is_rehashed(self):
        for program in (self.sealed,self.legacy):
            entry=self.build(program)
            for mutation in ('sql','order','partial'):
                with self.subTest(sealed='dbapiSql'in program,mutation=mutation):
                    artifact=json.loads(entry.artifact_json)
                    if mutation=='sql':artifact['dbapiSql']='SELECT unsafe()'
                    elif mutation=='order':artifact['dbapiParameterOrder']=['missing']
                    else:artifact.pop('dbapiParameterOrder')
                    artifact.pop('catalogDigest')
                    artifact['catalogDigest']=hashlib.sha256(_json(artifact).encode()).hexdigest()
                    with self.assertRaises(ReadBuildError):CatalogRead(_json(artifact),Minimum,Totals).artifact()


if __name__=='__main__':unittest.main()
