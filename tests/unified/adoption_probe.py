# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent synthetic host; no native executor qualification."""
import asyncio
import copy
import inspect
import json
import sys

sys.path.insert(0, sys.argv[1])
from adoption._runtime import WIRE_ERROR_CODES
from pathlib import Path
assert tuple(json.loads((Path(sys.argv[1])/'adoption/description.json').read_text())['errorCodes']) == WIRE_ERROR_CODES
from adoption import (Actions, Client, SyncActions, SyncClient, CustomerKey,
                      Project, ProjectKey, OpenProjectInput, OpenProjectPrecondition, MISSING,
                      AccessError, PreconditionFailed, WriteOutcomeUnknown,
                      write_outcomes_unknown)

class Host:
    def __init__(self):
        self.projects = {}
        self.calls = []
        self.replays = {}

    def execute(self, request):
        self.calls.append(copy.deepcopy(request))
        assert request['contract'] == 'umf.access/1'
        schema = request['schema']
        def refusal(identity):
            return {'code': 'PRECONDITION_FAILED', 'precondition': identity}
        def perform(inputs, validate=False):
            code = inputs['code']
            if code in self.projects: return {'status':'refused', 'error':refusal('fresh')}
            if inputs['client'] != {'Customer.code':'C1'}: return {'status':'refused', 'error':refusal('exists')}
            if not validate:
                self.projects[code] = {'Project.code': code, 'Project.title': inputs['title']}
                if 'note' in inputs: self.projects[code]['Project.note'] = inputs['note']
            return {'status':'applied', 'receipt':{'created':[{'record':'example.Project','key':{'Project.code':code}}], 'changed':[], 'counts':{'created':1}}}
        kind = request['kind']
        if kind == 'validate':
            result = perform(request['inputs'], validate=True)
            assert 'idempotency_key' not in request
            return {'schema':schema, 'error':result['error']} if result['status']=='refused' else {'schema':schema,'valid':True}
        if kind == 'apply':
            result = perform(request['inputs'])
            if result['status']=='refused': return {'schema':schema,'error':result['error']}
            return {'schema':schema,'status':'committed',**result['receipt'],'consistency_token':'cut'}
        assert kind == 'apply_batch'
        key = request['idempotency_key']
        signature = json.dumps({k:v for k,v in request.items() if k!='idempotency_key'},sort_keys=True)
        if key in self.replays:
            old, result = self.replays[key]
            return result if old == signature else {'schema':schema,'error':{'code':'CONFLICT'}}
        before = copy.deepcopy(self.projects)
        results = []
        stopped = False
        for inputs in request['items']:
            result = {'status':'unattempted'} if stopped else perform(inputs)
            results.append(result)
            if result['status']=='refused' and request['stop_on_error']: stopped = True
        if request['atomic'] and any(r['status']=='refused' for r in results):
            self.projects = before
            results = [{'status':'rolled_back'} if r['status']=='applied' else r for r in results]
        response = {'schema':schema,'items':results,'consistency_token':'batch-cut'}
        if key is not None: self.replays[key]=(signature,response)
        return response

class AsyncHost:
    def __init__(self, host): self.host=host
    async def execute(self, request): return self.host.execute(request)

async def call(method, *args, **kwargs):
    result = method(*args, **kwargs)
    return await result if inspect.isawaitable(result) else result

async def run(mode):
    host=Host()
    actions = SyncActions(SyncClient(host)) if mode=='sync' else Actions(Client(AsyncHost(host)))
    args={'title':'Title','client':CustomerKey(code='C1')}
    assert OpenProjectPrecondition.FRESH == 'fresh'
    assert OpenProjectPrecondition.EXISTS == 'exists'
    result=await call(actions.open_project_validate,code='P1',**args)
    assert result.valid is True and host.projects == {}
    receipt=await call(actions.open_project,code='P1',**args)
    assert receipt.status=='committed' and receipt.created[0].code=='P1'
    assert 'Project.note' not in host.projects['P1'] and 'note' not in host.calls[-1]['inputs']
    await call(actions.open_project,code='P2',note=None,**args)
    assert host.projects['P2']['Project.note'] is None
    await call(actions.open_project,code='P3',note='text',**args)
    assert host.projects['P3']['Project.note']=='text'
    for method,code,client,expected in [(actions.open_project,'P1',CustomerKey(code='C1'),'fresh'),(actions.open_project_validate,'new',CustomerKey(code='missing'),'exists')]:
        try: await call(method,code=code,title='Title',client=client)
        except PreconditionFailed as e: assert e.precondition==expected and str(e)=='PRECONDITION_FAILED'
        else: raise AssertionError('precondition was not enforced')
    def item(code, **kwargs): return OpenProjectInput(code=code,**args,**kwargs)
    before=len(host.calls)
    for items,flags in [([],{}),([item('x')]*101,{}),([{'code':'x'}],{}),([item('x')],{'atomic':1}),([OpenProjectInput(code=12,**args)],{}),([item('x')],{'idempotency_key':''})]:
        try: await call(actions.open_project_batch,items,**flags)
        except (AccessError,TypeError): pass
        else: raise AssertionError('invalid batch accepted')
    from collections.abc import Sequence
    class Misreported(Sequence):
        def __init__(self, count): self.count,self.reads=count,0
        def __len__(self): return 1
        def __getitem__(self, index):
            self.reads+=1
            if index>=self.count: raise IndexError
            return item('overflow')
    for count in (0,101,1000000):
        sequence=Misreported(count)
        try: await call(actions.open_project_batch,sequence)
        except AccessError as e: assert e.code=='LIMIT' and sequence.reads<=101
        else: raise AssertionError('reported sequence length bypassed batch bound')
    assert len(host.calls)==before
    batch=await call(actions.open_project_batch,[item('B1'),item('P1'),item('B2')],stop_on_error=True,idempotency_key='partial')
    assert [i.status for i in batch.items]==['applied','refused','unattempted']
    assert batch.items[0].receipt.consistency_token==batch.consistency_token
    assert batch.items[1].error.precondition==OpenProjectPrecondition.FRESH
    assert 'B2' not in host.projects
    replay=await call(actions.open_project_batch,[item('B1'),item('P1'),item('B2')],stop_on_error=True,idempotency_key='partial')
    assert [i.status for i in replay.items]==[i.status for i in batch.items]
    atomic=await call(actions.open_project_batch,[item('A1'),item('P1'),item('A2')],atomic=True)
    assert [i.status for i in atomic.items]==['rolled_back','refused','rolled_back']
    assert 'A1' not in host.projects and 'A2' not in host.projects
    complete=await call(actions.open_project_batch,[item('C'+str(i)) for i in range(100)],atomic=True)
    assert len(complete.items)==100 and all(i.status=='applied' for i in complete.items)
    partial=await call(actions.open_project_batch,[item('D1'),item('P1'),item('D2')])
    assert [i.status for i in partial.items]==['applied','refused','applied']

    class Response:
        def __init__(self, transform): self.transform,self.calls=transform,0
        def execute(self, request):
            self.calls+=1
            return self.transform(request)
    def bind(response):
        return SyncActions(SyncClient(response)) if mode=='sync' else Actions(Client(AsyncHost(response)))
    good=lambda q: {'schema':q['schema'],'status':'committed','created':[],'changed':[],'counts':{},'consistency_token':'cut'}
    empty_receipt=await call(bind(Response(lambda q:{k:v for k,v in good(q).items() if k!='status'})).open_project,code='EMPTY',idempotency_key='empty-key',**args)
    assert empty_receipt.status=='committed' and empty_receipt.created==() and empty_receipt.changed==() and dict(empty_receipt.counts)=={}
    malformed=[lambda q:None,lambda q:{},lambda q:{**good(q),'schema':'wrong'},lambda q:{**good(q),'status':'pending'},
               lambda q:{**good(q),'consistency_token':None},lambda q:{**good(q),'counts':{'created':True}},
               lambda q:{**good(q),'created':[{'record':'example.Project','key':{'Project.code':12}}]},
               lambda q:{**good(q),'changed':None},lambda q:{k:v for k,v in good(q).items() if k!='created'},
               lambda q:{k:v for k,v in good(q).items() if k!='changed'},lambda q:{k:v for k,v in good(q).items() if k!='counts'},
               lambda q:{k:v for k,v in good(q).items() if k!='consistency_token'},
               lambda q:{**good(q),'counts':{'created':-1}},lambda q:{**good(q),'counts':{'created':1.5}},lambda q:{'schema':q['schema'],'error':None},
               lambda q:{'schema':q['schema'],'error':{'code':'NEW_UNKNOWN'}},
               lambda q:{'schema':q['schema'],'error':{'code':'DENIED','precondition':[]}},
               lambda q:{**good(q),'error':{'code':'DENIED'}}]
    for transform in malformed:
        response=Response(transform)
        try: await call(bind(response).open_project,code='U',idempotency_key='lost-key',**args)
        except WriteOutcomeUnknown as e: assert e.key=='lost-key' and response.calls==1
        else: raise AssertionError('malformed write response accepted')
    for exc in (RuntimeError('private'),AccessError('DENIED')):
        def raising(q): raise exc
        response=Response(raising)
        try: await call(bind(response).open_project,code='U',idempotency_key='lost-key',**args)
        except WriteOutcomeUnknown as e: assert e.key=='lost-key' and response.calls==1 and 'private' not in str(e)
        else: raise AssertionError('exception proved rollback')
    response=Response(lambda q:{'schema':q['schema'],'error':{'code':'UNSUPPORTED'}})
    try: await call(bind(response).open_project_batch,[item('X')],atomic=True)
    except AccessError as e: assert e.code=='UNSUPPORTED' and not isinstance(e,WriteOutcomeUnknown)
    else: raise AssertionError('unsupported batch accepted')
    for transform in (lambda q:{'schema':q['schema'],'valid':False},lambda q:{'schema':q['schema'],'valid':True,'consistency_token':'pending'}):
        try: await call(bind(Response(transform)).open_project_validate,code='X',**args)
        except AccessError as e: assert e.code=='INVALID_RESPONSE' and not isinstance(e,WriteOutcomeUnknown)
        else: raise AssertionError('invalid validation accepted')
    def batch_response(q,statuses):
        return {'schema':q['schema'],'consistency_token':'cut','items':[{'status':s} for s in statuses]}
    response=Response(lambda q:batch_response(q,['unknown','unattempted']))
    result=await call(bind(response).open_project_batch,[item('X'),item('Y')],stop_on_error=True)
    assert [x.status for x in result.items]==['unknown','unattempted']
    for transform,flags in [(lambda q:{'schema':q['schema'],'items':[],'consistency_token':'cut'},{}),
                            (lambda q:batch_response(q,['unknown','unattempted']),{'atomic':True}),
                            (lambda q:batch_response(q,['unattempted','unattempted']),{'stop_on_error':True}),
                            (lambda q:batch_response(q,['rolled_back','rolled_back']),{}),
                            (lambda q:batch_response(q,['unknown','unattempted']),{'atomic':True,'stop_on_error':True}),
                            (lambda q:{'schema':q['schema'],'status':'pending','items':[],'consistency_token':'cut'},{})]:
        response=Response(transform)
        try: await call(bind(response).open_project_batch,[item('X'),item('Y')],idempotency_key='batch-key',**flags)
        except WriteOutcomeUnknown as e: assert e.key=='batch-key' and response.calls==1
        else: raise AssertionError('malformed batch accepted')

    def settlement(q,statuses):
        outcomes=[]
        for status in statuses:
            if status=='applied': outcomes.append({'status':status,'receipt':{'created':[],'changed':[],'counts':{}}})
            elif status=='refused': outcomes.append({'status':status,'error':{'code':'DENIED'}})
            else: outcomes.append({'status':status})
        return {'schema':q['schema'],'items':outcomes,'consistency_token':'cut'}
    valid_settlements=[
        (['applied','applied'],{}),
        (['refused'],{}),
        (['rolled_back','refused','rolled_back'],{'atomic':True}),
        (['refused','unattempted'],{'atomic':True,'stop_on_error':True}),
        (['applied','refused','unattempted'],{'stop_on_error':True}),
        (['unknown','unattempted'],{'stop_on_error':True}),
    ]
    for statuses,flags in valid_settlements:
        response=Response(lambda q,s=statuses:settlement(q,s))
        result=await call(bind(response).open_project_batch,[item('X'),item('Y'),item('Z')][:len(statuses)],idempotency_key='batch-matrix-key',**flags)
        assert [x.status for x in result.items]==statuses and response.calls==1
    matrix=[
        ['applied','applied'],
        ['refused'],
        ['refused','unattempted'],
        ['unknown','unattempted'],
        ['unattempted','refused'],
        ['refused','unattempted','refused'],
        ['refused','unattempted','applied'],
        ['refused','rolled_back','unattempted'],
    ]
    for atomic in (False,True):
        for stop in (False,True):
            for statuses in matrix:
                expected=(
                    statuses == ['applied','applied']
                    or statuses == ['refused']
                    or statuses == ['refused','unattempted'] and stop
                    or statuses == ['unknown','unattempted'] and stop and not atomic
                )
                response=Response(lambda q,s=statuses:settlement(q,s))
                try:
                    result=await call(bind(response).open_project_batch,[item('M'+str(i)) for i in range(len(statuses))],atomic=atomic,stop_on_error=stop,idempotency_key='flag-matrix-key')
                except WriteOutcomeUnknown as error:
                    assert not expected and error.key=='flag-matrix-key' and response.calls==1
                else:
                    assert expected and [item.status for item in result.items]==statuses and response.calls==1

async def main():
    for mode in ('sync','async'): await run(mode)
    for batch in (False, True):
        class Waiting:
            def __init__(self): self.started=asyncio.Event(); self.calls=0; self.cancellation=None
            async def execute(self, request):
                self.calls+=1
                self.started.set()
                try: await asyncio.Future()
                except asyncio.CancelledError as error:
                    self.cancellation=error
                    raise
        transport=Waiting()
        actions=Actions(Client(transport))
        args={'code':'X','title':'Project','client':CustomerKey(code='C1')}
        operation=actions.open_project_batch([OpenProjectInput(**args)],idempotency_key='cancel-key') if batch else actions.open_project(**args,idempotency_key='cancel-key')
        task=asyncio.create_task(operation)
        await transport.started.wait()
        task.cancel()
        try: await task
        except asyncio.CancelledError as error:
            assert error is transport.cancellation and type(error) is asyncio.CancelledError and task.cancelled() and task.cancelling()==1 and transport.calls==1
            outcomes=write_outcomes_unknown(error)
            assert len(outcomes)==1 and outcomes[0].key=='cancel-key'
        else: raise AssertionError('task cancellation proved rollback')

    class TimeoutHost:
        def __init__(self): self.started=asyncio.Event(); self.calls=0
        async def execute(self, request):
            self.calls+=1; self.started.set()
            await asyncio.Future()
    for batch in (False,True):
        timeout_host=TimeoutHost(); timeout_actions=Actions(Client(timeout_host)); key='timeout-batch' if batch else 'timeout-key'
        operation=(timeout_actions.open_project_batch([OpenProjectInput(code='TIMEOUT',title='T',client=CustomerKey(code='C1'))],idempotency_key=key)
                   if batch else timeout_actions.open_project(code='TIMEOUT',title='T',client=CustomerKey(code='C1'),idempotency_key=key))
        try:
            async with asyncio.timeout(0.01): await operation
        except TimeoutError as error:
            outcomes=write_outcomes_unknown(error)
            assert len(outcomes)==1 and outcomes[0].key==key and timeout_host.calls==1
        else: raise AssertionError('timeout context did not preserve timeout semantics')

    class GroupHost:
        def __init__(self): self.started=asyncio.Event(); self.cancellation=None
        async def execute(self, request):
            self.started.set()
            try: await asyncio.Future()
            except asyncio.CancelledError as error:
                self.cancellation=error
                raise
    group_host=GroupHost()
    async def fail_group_sibling():
        await group_host.started.wait()
        raise ValueError('sibling failed')
    try:
        async with asyncio.TaskGroup() as group:
            group.create_task(Actions(Client(group_host)).open_project(code='GROUP',title='T',client=CustomerKey(code='C1'),idempotency_key='group-key'))
            group.create_task(fail_group_sibling())
    except* ValueError as errors:
        assert len(errors.exceptions)==1 and not any(isinstance(x, asyncio.CancelledError) for x in errors.exceptions)
        outcomes=write_outcomes_unknown(group_host.cancellation)
        assert len(outcomes)==1 and outcomes[0].key=='group-key'

    # Explicitly raised cancellation is preserved by both transport bindings.
    for mode in ('sync','async'):
        original_cancel=asyncio.CancelledError('transport cancellation')
        class SyncCancelTransport:
            def execute(self, request): raise original_cancel
        class AsyncCancelTransport:
            async def execute(self, request): raise original_cancel
        transport=SyncCancelTransport() if mode=='sync' else AsyncCancelTransport()
        actions=SyncActions(SyncClient(transport)) if mode=='sync' else Actions(Client(transport))
        try:
            await call(actions.open_project,code='SPONTANEOUS',title='T',client=CustomerKey(code='C1'),idempotency_key='spontaneous-'+mode)
        except asyncio.CancelledError as error:
            assert error is original_cancel
            outcomes=write_outcomes_unknown(error)
            assert len(outcomes)==1 and outcomes[0].key=='spontaneous-'+mode
        else: raise AssertionError('spontaneous cancellation was replaced')

    reused=asyncio.CancelledError('reused cancellation')
    class ReusedCancelTransport:
        async def execute(self, request): raise reused
    reused_actions=Actions(Client(ReusedCancelTransport()))
    for key in ('reuse-key','reuse-key'):
        try: await reused_actions.open_project(code='REUSE',title='T',client=CustomerKey(code='C1'),idempotency_key=key)
        except asyncio.CancelledError as error: assert error is reused
        else: raise AssertionError('reused cancellation was replaced')
    reused_outcomes=write_outcomes_unknown(reused)
    assert [outcome.key for outcome in reused_outcomes]==['reuse-key','reuse-key'] and reused_outcomes[0] is not reused_outcomes[1]

    class ConcurrentCancelTransport:
        def __init__(self): self.started={key:asyncio.Event() for key in ('concurrent-a','concurrent-b')}; self.errors={}
        async def execute(self, request):
            key=request['idempotency_key']
            self.started[key].set()
            try: await asyncio.Future()
            except asyncio.CancelledError as error:
                self.errors[key]=error
                raise
    concurrent=ConcurrentCancelTransport(); concurrent_actions=Actions(Client(concurrent))
    predispatch=asyncio.create_task(concurrent_actions.open_project(code='PREDISPATCH',title='T',client=CustomerKey(code='C1'),idempotency_key='never-dispatched'))
    predispatch.cancel()
    try: await predispatch
    except asyncio.CancelledError as error:
        assert not any(event.is_set() for event in concurrent.started.values()) and write_outcomes_unknown(error)==()
    else: raise AssertionError('pre-dispatch cancellation was not preserved')
    tasks={key:asyncio.create_task(concurrent_actions.open_project(code=key,title='T',client=CustomerKey(code='C1'),idempotency_key=key)) for key in ('concurrent-a','concurrent-b')}
    await asyncio.gather(*(concurrent.started[key].wait() for key in tasks))
    for task in tasks.values(): task.cancel()
    results=await asyncio.gather(*tasks.values(),return_exceptions=True)
    assert all(type(error) is asyncio.CancelledError for error in results)
    # Inspect each transport-caught original: gather may normalize task exceptions across supported Python versions.
    for key,error in concurrent.errors.items():
        outcomes=write_outcomes_unknown(error)
        assert len(outcomes)==1 and outcomes[0].key==key

    class ReadCancelTransport:
        async def execute(self, request): raise asyncio.CancelledError('read canceled')
    read_client=Client(ReadCancelTransport())
    for operation in (Actions(read_client).open_project_validate(code='READ',title='T',client=CustomerKey(code='C1')),
                      Project.objects.using(read_client).get(ProjectKey(code='READ'))):
        try: await operation
        except asyncio.CancelledError as error: assert write_outcomes_unknown(error)==()
        else: raise AssertionError('read/validate cancellation was swallowed')

    direct=WriteOutcomeUnknown(key='direct-key')
    wrapped=RuntimeError('wrapped')
    wrapped.__cause__=direct
    wrapped.__context__=WriteOutcomeUnknown(key='unrelated-context')
    wrapped.__suppress_context__=False
    assert write_outcomes_unknown(wrapped)==(direct,)
    first,second=WriteOutcomeUnknown(key='first'),WriteOutcomeUnknown(key='second')
    annotated=RuntimeError('annotated'); annotated._umf_write_outcomes_unknown=(first,first,second)
    contextual=RuntimeError('contextual'); contextual.__context__=annotated
    assert write_outcomes_unknown(contextual)==(first,second)
    cycle=RuntimeError('cycle'); cycle.__cause__=cycle
    assert write_outcomes_unknown(cycle)==()
    hidden_context=asyncio.CancelledError('hidden')
    hidden_context._umf_write_outcomes_unknown=(WriteOutcomeUnknown(key='hidden-key'),)
    try:
        try: raise hidden_context
        except asyncio.CancelledError:
            raise RuntimeError('from-none') from None
    except RuntimeError as error:
        assert write_outcomes_unknown(error)==()
    print(json.dumps(dict(modes=2,preconditions=True,optional=True,batches=True,validation=True,uncertainty=True,noRetries=True)))
asyncio.run(main())
