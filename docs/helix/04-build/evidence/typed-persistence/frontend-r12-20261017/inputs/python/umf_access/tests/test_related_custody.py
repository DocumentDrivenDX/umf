"""Build-time original compiler packet custody, independent of native admission."""
import copy
import json
import unittest

from umf_access.reviewed import ReadBuildError, ReviewedSQL
from umf_access.types import StrictModel


class Empty(StrictModel):
    pass

class Compiler:
    def __init__(self, tamper=False):
        self.tamper=tamper
        self.request=None
    def compile_raw_read_json(self, request):
        raise AssertionError('navigation must use original related endpoint')
    def compile_related_read_json(self, request):
        self.request=json.loads(request)
        target=self.request['target']
        echo=copy.deepcopy(self.request)
        if self.tamper:
            echo['source']['sql']='SELECT * FROM different_source'
        return json.dumps({'version':'weft.raw-read/0.1','status':'compiled','target':target['target'],'binding':target['binding'],'sourceSql':target['sql'],'parameters':[],'outputs':[],'sql':'SELECT 1','parameterOrder':[],'relatedRequest':echo})

class RelatedCustodyTests(unittest.TestCase):
    def test_original_source_target_inventory_and_relationship_echo(self):
        compiler=Compiler()
        result=ReviewedSQL('SELECT target',Empty,Empty).build(compiler,target='postgresql18',binding={},related_source='SELECT source ORDER BY id LIMIT 2',related_relationship={'module':'m','id':'r','direction':'inverse'})
        self.assertEqual(compiler.request['source']['sql'],'SELECT source ORDER BY id LIMIT 2')
        self.assertEqual(compiler.request['target']['sql'],'SELECT target')
        self.assertEqual(compiler.request['relationship'],{'module':'m','id':'r','direction':'inverse'})
        self.assertEqual(json.loads(result.artifact_json)['relatedRequest'],compiler.request)
    def test_substituted_original_source_refuses(self):
        with self.assertRaisesRegex(ReadBuildError,'custody differs'):
            ReviewedSQL('SELECT target',Empty,Empty).build(Compiler(True),target='postgresql18',binding={},related_source='SELECT source',related_relationship={'module':'m','id':'r','direction':'forward'})
    def test_missing_original_endpoint_refuses_named_requirement(self):
        class RawOnly:
            def compile_raw_read_json(self, request):
                raise AssertionError('must not fall back')
        with self.assertRaisesRegex(ReadBuildError,'WR-A6'):
            ReviewedSQL('SELECT target',Empty,Empty).build(RawOnly(),target='postgresql18',binding={},related_source='SELECT source',related_relationship={'module':'m','id':'r','direction':'forward'})
