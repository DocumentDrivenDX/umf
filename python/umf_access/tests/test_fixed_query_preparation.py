# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed query preparation stays outside per-principal/per-value invocations."""
import json
import sys
import unittest
from types import ModuleType
from unittest.mock import patch
from test_operation_input_snapshot import _fixture
from umf_access.unified import SessionError, SessionIdentity
from umf_access.unified.table_reads import SyncTableReader
from umf_access.unified.table_writes import SyncTableWriter

class FixedQueryPreparation(unittest.TestCase):
    def test_resolve_once_bind_values_for_each_call_without_native_lease(self):
        session,binding,probe,identity=_fixture('query')
        prepared=[];bindings=[]
        class Query:
            def program_json(self):return '{}'
            def bind_json(self,raw):
                bindings.append(json.loads(raw))
                raise SessionError('stop after typed binding')
        compiler=ModuleType('weft')
        class Module:
            def prepare_query(self,operation):
                self_operation=operation
                assert self_operation=='operation'
                return Query()
        def prepare(raw):
            prepared.append(json.loads(raw));return Module()
        compiler.prepare_table_operation_module_json=prepare
        reader=SyncTableReader(session,{}, {},binding,cursor_secret=b'x'*32)
        with patch.dict(sys.modules,{'weft':compiler}),patch('umf_access.unified.table_reads._prepare',return_value=probe) as source:
            for person,value in [('alice','first'),('bob','second'),('alice','third')]:
                with self.assertRaisesRegex(SessionError,'stop after typed binding'):
                    reader._prepare(SessionIdentity('person',person),'operation',{'filter':{'string':value}},None,None)
            self.assertEqual(source.call_count,1)
            with self.assertRaisesRegex(SessionError,'paging'):
                reader._prepare(identity,'operation',{},1,None)
        self.assertEqual(len(prepared),1)
        self.assertEqual(set(prepared[0]),{'version','target','binding','module'})
        self.assertEqual([set(value) for value in bindings],[{'inputs'}]*3)
        self.assertEqual([value['inputs']['filter']['string'] for value in bindings],['first','second','third'])

    def test_reads_and_writes_share_source_preparation_and_send_only_calls(self):
        session,binding,probe,identity=_fixture('read')
        modules=[];selected=[];calls=[]
        class Operation:
            def bind_json(self,raw):
                calls.append(json.loads(raw))
                raise SessionError('stop after ordinary binding')
        class Module:
            def prepare(self,operation):
                selected.append(operation)
                return Operation()
        compiler=ModuleType('weft')
        def prepare(raw):
            modules.append(json.loads(raw))
            return Module()
        compiler.prepare_table_operation_module_json=prepare
        reader=SyncTableReader(session,{}, {},binding,cursor_secret=b'x'*32)
        writer=SyncTableWriter(session,{}, {},binding,outcome_secret=b'y'*32,_source_owner=reader)
        context=probe.binding_context
        with patch.dict(sys.modules,{'weft':compiler}):
            first=reader._prepared_for(context,'read')
            second=writer._prepared_for(context,'write')
            self.assertIs(first,reader._prepared_for(context,'read'))
            self.assertIs(second,writer._prepared_for(context,'write'))
            for operation in (first,second):
                with self.assertRaisesRegex(SessionError,'ordinary binding'):
                    operation.bind_json(json.dumps({'call':{'kind':'single','inputs':{}},'idempotencyKey':'one'}))
        self.assertEqual(len(modules),1)
        self.assertEqual(selected,['read','write'])
        self.assertEqual([set(call) for call in calls],[{'call','idempotencyKey'}]*2)
        self.assertIs(writer._binding,reader._binding)
        self.assertIs(writer._bundle,reader._bundle)
