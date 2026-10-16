import asyncio
from datetime import timedelta
from types import SimpleNamespace
from umf_access.native_actions import AsyncPostgresActionExecutor
from umf_access.protocols import ActionFailed, ActionRefused

async def probe(error, second_cancel=False):
    rolled = asyncio.Event()
    resume = asyncio.Event()
    class Connection:
        info = SimpleNamespace(transaction_status=0)
        async def execute(self, *args): return None
        async def rollback(self):
            rolled.set()
            if second_cancel: await resume.wait()
            else: await asyncio.sleep(0)
    class Admission:
        async def admit(self, *args, **kwargs): return SimpleNamespace(store='s',epoch='e')
    class State:
        program = {}
        scope = None
        def execute(self, validate):
            if False: yield None
            raise error
        def details(self, status): return status
    executor=AsyncPostgresActionExecutor.__new__(AsyncPostgresActionExecutor)
    executor.connection=Connection();executor.admission=Admission()
    executor.default_timeout=timedelta(seconds=3);executor.reconnect=None
    executor._state=lambda *args:State()
    task=asyncio.create_task(executor._run(None,{},None,False))
    if second_cancel:
        await rolled.wait();task.cancel();resume.set()
    try:
        await task
        raise AssertionError('error was lost')
    except ActionFailed as failure:
        assert failure.cause is error
        assert failure.__cause__ is error
        assert failure.original == 'rolled-back'
    except ActionRefused as failure:
        assert failure is error
    assert rolled.is_set()

async def main():
    await probe(ValueError('original'))
    await probe(ActionRefused('EXPECTED'))
    await probe(asyncio.CancelledError('original cancellation'))
    await probe(ValueError('original while cancelled again'),True)
    print('4 actual AsyncPostgresActionExecutor settlement controls pass; original cause identity retained, including second cancellation. Unit control only, no native authority claim.')
asyncio.run(main())
