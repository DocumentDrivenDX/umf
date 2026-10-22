# SPDX-License-Identifier: MIT OR Apache-2.0
"""Current core0.10 read compilation and catalog transport integrity controls.

Synthetic old-format variants remove only additive transport members and reseal
the original real compiler program. These tests do not qualify native execution.
"""
from __future__ import annotations

import copy
import hashlib
import json
import unittest
from unittest.mock import patch

from test_reviewed_reads import TOTAL_SQL, Compiler, Minimum, Totals, binding
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
        if not all(name in cls.original for name in ('dbapiSql','dbapiParameterOrder')):
            raise AssertionError('current compiler must emit sealed DBAPI transport')

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
