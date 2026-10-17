"""Async command dispatch returns an awaitable inert plan, never sync execution."""
import asyncio
import inspect
import unittest
from types import SimpleNamespace

from umf_access.adoption import TargetIdentity
from umf_access.catalog import TargetPin
from umf_access.commands import CommandPlan, CommandVariant


class AsyncBulkPlanTests(unittest.TestCase):
    def fixture(self):
        identity=TargetIdentity('postgresql','pg','18','p','a'*64,(('postgresql','18'),))
        pin=TargetPin('postgresql','pg','18','p','a'*64,(('postgresql',('18',)),))
        program=SimpleNamespace(bind=lambda action:None)
        entry=CommandVariant((),pin,program,object(),())
        return identity,CommandPlan('command',(),(entry,))
    def test_async_plan_creation_is_awaited(self):
        identity,command=self.fixture()
        calls=[]
        class Target:
            def identity(self):return identity
            async def plan(self,entry,params,*,timeout=None):
                calls.append((entry,params,timeout))
                return 'inert-plan'
        value=command.run(Target(),{})
        self.assertTrue(inspect.isawaitable(value))
        self.assertEqual(calls,[])
        self.assertEqual(asyncio.run(value),'inert-plan')
        self.assertEqual(len(calls),1)
    def test_sync_plan_stays_immediate(self):
        identity,command=self.fixture()
        class Target:
            def identity(self):return identity
            def plan(self,entry,params,*,timeout=None):return 'inert-plan'
        self.assertEqual(command.run(Target(),{}),'inert-plan')
