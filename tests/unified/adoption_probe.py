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
                      OpenProjectInput, OpenProjectPrecondition, MISSING,
                      AccessError, PreconditionFailed, WriteOutcomeUnknown)

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
    malformed=[lambda q:None,lambda q:{},lambda q:{**good(q),'schema':'wrong'},lambda q:{**good(q),'status':'pending'},
               lambda q:{**good(q),'consistency_token':None},lambda q:{**good(q),'counts':{'created':True}},
               lambda q:{**good(q),'created':[{'record':'example.Project','key':{'Project.code':12}}]},
               lambda q:{**good(q),'changed':None},lambda q:{k:v for k,v in good(q).items() if k!='counts'},
               lambda q:{**good(q),'counts':{'created':-1}},lambda q:{**good(q),'counts':{'created':1.5}},lambda q:{'schema':q['schema'],'error':None},
               lambda q:{'schema':q['schema'],'error':{'code':'NEW_UNKNOWN'}},
               lambda q:{'schema':q['schema'],'error':{'code':'DENIED','precondition':[]}},
               lambda q:{**good(q),'error':{'code':'DENIED'}}]
    for transform in malformed:
        response=Response(transform)
        try: await call(bind(response).open_project,code='U',idempotency_key='lost-key',**args)
        except WriteOutcomeUnknown as e: assert e.key=='lost-key' and response.calls==1
        else: raise AssertionError('malformed write response accepted')
    for exc in (RuntimeError('private'),AccessError('DENIED'),asyncio.CancelledError()):
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
                            (lambda q:{'schema':q['schema'],'status':'pending','items':[],'consistency_token':'cut'},{})]:
        response=Response(transform)
        try: await call(bind(response).open_project_batch,[item('X'),item('Y')],idempotency_key='batch-key',**flags)
        except WriteOutcomeUnknown as e: assert e.key=='batch-key' and response.calls==1
        else: raise AssertionError('malformed batch accepted')

async def main():
    for mode in ('sync','async'): await run(mode)
    for batch in (False, True):
        class Waiting:
            def __init__(self): self.started=asyncio.Event(); self.calls=0
            async def execute(self, request):
                self.calls+=1
                self.started.set()
                await asyncio.Future()
        transport=Waiting()
        actions=Actions(Client(transport))
        args={'code':'X','title':'Project','client':CustomerKey(code='C1')}
        operation=actions.open_project_batch([OpenProjectInput(**args)],idempotency_key='cancel-key') if batch else actions.open_project(**args,idempotency_key='cancel-key')
        task=asyncio.create_task(operation)
        await transport.started.wait()
        task.cancel()
        try: await task
        except WriteOutcomeUnknown as e: assert e.key=='cancel-key' and transport.calls==1
        else: raise AssertionError('task cancellation proved rollback')
    print(json.dumps(dict(modes=2,preconditions=True,optional=True,batches=True,validation=True,uncertainty=True,noRetries=True)))
asyncio.run(main())
