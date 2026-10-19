# SPDX-License-Identifier: MIT OR Apache-2.0
"""Closed wire controls; native driver acceptance lives in the PG18 fixture."""
import asyncio
import json
import unittest
from contextlib import asynccontextmanager, contextmanager
from unittest.mock import AsyncMock, Mock

from umf_access.unified import (
    AsyncSession,
    NativeTableBinding,
    SessionError,
    SessionIdentity,
    SessionPolicy,
    SyncNativeTableBinding,
    SyncSession,
)


class NativeBindingControls(unittest.TestCase):
    def setUp(self):
        self.leases=[]
        self.policy=SessionPolicy({'alice':'alice_role'},{'job':'batch_role'},'demo',catalog_only=True)
        self.identity=SessionIdentity('person','alice')
        self.bundle={'sourceDigest':'a'*64,'configuration':{'module':'demo'},'source':{'format':'json','utf8':json.dumps({'modules':[{'id':'demo','extensions':{'umf.tables':{'commands':[{'id':'read','body':{'kind':'read'}}]}}}]})}}
        @contextmanager
        def factory(_):
            self.leases.append(True)
            raise AssertionError('invalid request leased')
            yield
        self.session=SyncSession(factory,self.policy)
        self.host=SyncNativeTableBinding(self.session,self.bundle,{}, {},cursor_secret=b'x'*32,outcome_secret=b'y'*32)
        self.request={'contract':'umf.access/1','schema':'a'*64,'kind':'table','module':'demo','operation':'read','call':{'kind':'single','inputs':{}},'phase':'invoke','mutation':False,'idempotency_key':None}

    def test_wire_cannot_choose_identity_sql_or_mutation(self):
        for change in ({'identity':'alice'},{'sql':'SELECT private'},{'mutation':True},{'phase':'observe'},{'call':{'kind':'single','inputs':{},'after':[]}}):
            response=self.host.execute({**self.request,**change},identity=self.identity)
            self.assertEqual(response['error']['code'],'INVALID')
        self.assertEqual(self.leases,[])

    def test_registry_and_mode_are_checked_before_leasing(self):
        with self.assertRaises(SessionError):self.host.for_identity(SessionIdentity('batch','alice'))
        with self.assertRaisesRegex(SessionError,'mode mismatch'):
            NativeTableBinding(self.session,self.bundle,{}, {},cursor_secret=b'x'*32,outcome_secret=b'y'*32)
        self.assertEqual(self.leases,[])

    def test_response_sanitizes_native_diagnostics(self):
        self.host._reader.read=Mock(side_effect=RuntimeError('private SQL and secret connection URI'))
        response=self.host.for_identity(self.identity).execute(self.request)
        self.assertEqual(response,{'schema':'a'*64,'error':{'code':'BUSY'}})

    def test_async_cancellation_is_preserved(self):
        @asynccontextmanager
        async def factory(_):
            raise AssertionError('unexpected lease')
            yield
        host=NativeTableBinding(AsyncSession(factory,self.policy),self.bundle,{}, {},cursor_secret=b'x'*32,outcome_secret=b'y'*32)
        host._reader.read=AsyncMock(side_effect=asyncio.CancelledError())
        with self.assertRaises(asyncio.CancelledError):asyncio.run(host.for_identity(self.identity).execute(self.request))
