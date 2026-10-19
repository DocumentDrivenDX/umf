// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generatePythonClient} from '../src/access';
import {tableOperationSource} from './unified/table-operation-fixture';

test('declared tables generate module-only typed APIs and closed result/outcome codecs',async()=>{
 const text=JSON.stringify(tableOperationSource());
 const generated=generatePythonClient({text,package:'native_demo'});
 const models=generated.files.find(f=>f.path==='native_demo/models.py')!.text;
 expect(models).toContain('async def read_count(self, *, owner: str) -> int:');
 expect(models).toContain('items: tuple[DemoCreateBatchInput, ...]');
 expect(models).not.toContain('class Note:');
 expect(generated.files.find(f=>f.path==='native_demo/source.json')!.text).toBe(text);
 expect(()=>generatePythonClient({text,format:'yaml',package:'native_demo'})).toThrow('original JSON');
 const work=await mkdtemp(join(tmpdir(),'umf-native-codecs-'));
 for(const file of generated.files){const path=join(work,file.path);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,file.text);}
 const script=`import sys, asyncio, dataclasses
sys.path.insert(0, ${JSON.stringify(work)})
from native_demo import *
class Host:
    def __init__(self):self.calls=[];self.reply=None
    def execute(self,request):
        self.calls.append(request)
        if isinstance(self.reply,Exception):raise self.reply
        return self.reply
host=Host();client=SyncClient(host);module=client.modules.demo
assert not hasattr(client,'execute') and not hasattr(module,'objects')
def read(kind,**values):
    return {'schema':client.schema,'table':dict(version='umf.table-read-result/0.1',module='demo',operation='read_'+kind,sourceDigest=client.schema,kind=kind,**values)}
host.reply=read('many',rows=[{'id':'a','owner':'alice'}],cursor=None)
assert module.read_many(owner='alice')[0].id=='a'
assert host.calls[-1]['call']=={'kind':'single','inputs':{'owner':{'string':'alice'}}}
assert set(host.calls[-1])=={'contract','schema','kind','module','operation','call','phase','mutation','idempotency_key'}
host.reply=read('count',count={'integerToken':'9'})
assert module.read_count(owner='alice')==9
host.reply=read('page',rows=[{'id':'a','owner':'alice'}],cursor='opaque')
assert module.read_page(owner='alice',size=1).next_cursor=='opaque'
host.reply=read('optional',rows=[],cursor=None)
assert module.read_optional(owner='alice') is None
before=len(host.calls)
for call in [lambda:module.read_many(owner=1),lambda:module.read_many(owner='alice',size=True),lambda:module.create_batch_batch(items=(DemoCreateInput(id='x',owner='alice'),),idempotency_key='k')]:
    try:call()
    except (TypeError,ValueError):pass
    else:raise AssertionError('invalid arguments accepted')
assert len(host.calls)==before
host.reply=read('count',count={'integerToken':'9'*5000})
try:module.read_count(owner='alice')
except AccessError as error:assert error.code=='INVALID_RESPONSE'
else:raise AssertionError('unbounded count accepted')
receipt=dict(version='umf.table-outcome/0.1',module='demo',operation='create',sourceDigest=client.schema,configurationDigest='a'*64,bundleDigest='b'*64,headDigest='c'*64,invocationDigest='d'*64,scopeDigest='e'*64,effects=[{'integerToken':'1'}],responseDigest='f'*64)
base=dict(version='umf.table-write-result/0.1',key='key',commitResponsibility='adapter',durability='committed')
host.reply={'schema':client.schema,'table':dict(base,status='applied',receipt=receipt,result=dict(module='demo',operation='create',sourceDigest=client.schema,items=[dict(affectedCount={'integerToken':'1'},rows=[dict(id='a',owner='alice')])]))}
applied=module.create(id='a',owner='alice',idempotency_key='key')
assert isinstance(applied,Applied) and applied.items[0].rows[0].id=='a' and applied.receipt.effects==(1,)
try:applied.key='changed'
except dataclasses.FrozenInstanceError:pass
else:raise AssertionError('mutable result')
host.reply={'schema':client.schema,'table':dict(base,status='recovered',receipt=receipt)}
assert isinstance(module.create(id='a',owner='alice',idempotency_key='key'),Recovered)
assert isinstance(module.create_observe(id='a',owner='alice',idempotency_key='key'),Recovered)
host.reply={'schema':client.schema,'table':dict(base,status='not-observed',durability='not-observed')}
assert isinstance(module.create_observe(id='a',owner='alice',idempotency_key='key'),NotObserved)
for reply in [RuntimeError('connection lost'),{'schema':client.schema,'table':{}},{'schema':'wrong','table':{}}]:
    host.reply=reply;before=len(host.calls)
    try:module.create(id='a',owner='alice',idempotency_key='key')
    except WriteOutcomeUnknown as error:assert error.key=='key'
    else:raise AssertionError('uncertainty hidden')
    assert len(host.calls)==before+1
class AsyncHost:
    async def execute(self,request):return {'schema':client.schema,'table':dict(version='umf.table-read-result/0.1',module='demo',operation='read_count',sourceDigest=client.schema,kind='count',count={'integerToken':'4'})}
async def main():assert await Client(AsyncHost()).modules.demo.read_count(owner='alice')==4
asyncio.run(main())
print('closed native codecs passed')
`;
 const child=Bun.spawn(['python3','-I','-c',script],{stdout:'pipe',stderr:'pipe'});
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect({out,err,code}).toEqual({out:'closed native codecs passed\n',err:'',code:0});
});
