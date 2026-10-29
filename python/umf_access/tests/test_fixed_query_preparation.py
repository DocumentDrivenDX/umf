# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fixed query preparation stays outside per-principal/per-value invocations."""
import json
import sys
import unittest
from types import ModuleType
from unittest.mock import patch

from test_operation_input_snapshot import _fixture
from umf_access.unified import SessionError, SessionIdentity
from umf_access.unified.table_reads import AsyncTableReader, SyncTableReader
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
        self.assertEqual(prepared[0]['version'],'weft.table-operation-module/0.1')
        self.assertEqual([set(value) for value in bindings],[{'inputs'}]*3)
        self.assertEqual([value['inputs']['filter']['string'] for value in bindings],['first','second','third'])

    def test_reads_and_writes_share_source_preparation_and_send_only_calls(self):
        session,binding,probe,_identity=_fixture('read')
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

    def test_opt_in_profile_is_shared_by_sync_read_and_write_module_without_fallback(self):
        session,binding,probe,_identity=_fixture('read')
        session.policy.table_operation_module_profile='weft.table-operation-module/0.2'
        modules=[];selected=[]
        class Operation:
            def bind_json(self,raw):
                raise SessionError('stop after ordinary binding')
            def program_json(self):return '{}'
        class Module:
            def prepare(self,operation):
                selected.append(operation)
                return Operation()
            def prepare_query(self,operation):
                selected.append('query')
                return Operation()
        compiler=ModuleType('weft')
        compiler.prepare_table_operation_module_json=lambda raw: modules.append(json.loads(raw)) or Module()
        reader=SyncTableReader(session,{}, {},binding,cursor_secret=b'x'*32)
        writer=SyncTableWriter(session,{}, {},binding,outcome_secret=b'y'*32,_source_owner=reader)
        async_reader=AsyncTableReader(session,{}, {},binding,cursor_secret=b'x'*32,_source_owner=reader)
        query_session,query_binding,query_probe,_identity=_fixture('query')
        query_session.policy.table_operation_module_profile='weft.table-operation-module/0.2'
        query_reader=SyncTableReader(query_session,{}, {},query_binding,cursor_secret=b'z'*32)
        with patch.dict(sys.modules,{'weft':compiler}):
            for owner,operation in ((reader,'read'),(writer,'write'),(async_reader,'read')):
                prepared=owner._prepared_for(probe.binding_context,operation)
                with self.assertRaisesRegex(SessionError,'ordinary binding'):
                    prepared.bind_json('{}')
            query_reader._prepared_for(query_probe.binding_context,'operation',query=True)
        self.assertIs(async_reader._prepared_for(probe.binding_context,'read'),
                      reader._prepared_for(probe.binding_context,'read'))
        self.assertEqual(len(modules),2)
        self.assertEqual({module['version'] for module in modules},{'weft.table-operation-module/0.2'})
        self.assertEqual(selected,['read','write','query'])

    def test_unsupported_opt_in_profile_refuses_without_legacy_fallback(self):
        session,binding,probe,_identity=_fixture('read')
        session.policy.table_operation_module_profile='weft.table-operation-module/0.2'
        requests=[]
        compiler=ModuleType('weft')
        def unsupported(raw):
            requests.append(json.loads(raw)['version'])
            raise ValueError('selected module profile unsupported')
        compiler.prepare_table_operation_module_json=unsupported
        reader=SyncTableReader(session,{}, {},binding,cursor_secret=b'x'*32)
        with (patch.dict(sys.modules,{'weft':compiler}),
              self.assertRaisesRegex(SessionError,'declared read compilation refused')):
            reader._prepared_for(probe.binding_context,'read')
        self.assertEqual(requests,['weft.table-operation-module/0.2'])

    def test_cross_profile_source_owner_or_mutated_handle_refuses(self):
        session,binding,probe,_identity=_fixture('read')
        reader=SyncTableReader(session,{}, {},binding,cursor_secret=b'x'*32)
        session.policy.table_operation_module_profile='weft.table-operation-module/0.2'
        compiler=ModuleType('weft')
        compiler.prepare_table_operation_module_json=lambda _raw: self.fail('cross-profile module must not be prepared')
        with (patch.dict(sys.modules,{'weft':compiler}),
              self.assertRaisesRegex(SessionError,'profile differs from prepared source owner')):
            reader._prepared_for(probe.binding_context,'read')
        second_session,second_binding,_second_probe,_identity=_fixture('read')
        second_session.policy.table_operation_module_profile='weft.table-operation-module/0.2'
        with self.assertRaisesRegex(SessionError,'profile differs from shared source owner'):
            SyncTableWriter(second_session,{}, {},second_binding,outcome_secret=b'y'*32,_source_owner=reader)
