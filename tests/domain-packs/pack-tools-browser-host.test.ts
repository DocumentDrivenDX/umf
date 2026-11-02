// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import type {PackToolsRequest,PackToolsResult} from '../../src/domain-packs/pack-tools-types';
import type {Entry} from '../../docs/helix/05-deploy/schema-browser/types';
import {packDefaultOptions,packToolsRequest,runDomainPackTools} from '../../docs/helix/05-deploy/microsite/pack-tools-model';
import {packToolsZip} from '../../docs/helix/05-deploy/microsite/pack-tools-archive';
import {PackToolsWorkerClient} from '../../docs/helix/05-deploy/microsite/pack-tools-worker-client';

const packText=JSON.stringify({id:'demo-pack',version:'1.0.0',schemas:[{id:'items',format:'tablespec',reference:'schemas/items.json'}]});
const entries:Entry[]=[
 {id:'pack:demo-pack@1.0.0',title:'Demo Pack',category:'domain',path:'domain-pack.json',text:packText,format:'json',pack:'demo-pack',packVersion:'1.0.0'},
 {id:'schema:demo-pack@1.0.0:items',title:'Items',category:'domain',path:'schemas/items.json',text:'{"tables":[]}',format:'json',pack:'demo-pack',packVersion:'1.0.0'},
];
const request=packToolsRequest(entries[0]!,entries,{schema:'public',package:'demo_pack',targets:['ddl']});
const result:PackToolsResult={profile:'umf.pack-tools-result/1',status:'generated',pack:{id:'demo-pack',version:'1.0.0'},sourceDigest:'a'.repeat(64),files:[{path:'schema.sql',text:'CREATE TABLE x ();\n',sha256:'b'.repeat(64),kind:'ddl'}],diagnostics:[],coverage:[]};

class MockWorker {
 onmessage:((event:MessageEvent)=>void)|null=null;
 onerror:((event:ErrorEvent)=>void)|null=null;
 onmessageerror:(()=>void)|null=null;
 messages:any[]=[];terminated=false;
 postMessage(message:unknown){this.messages.push(message);}
 terminate(){this.terminated=true;}
 send(data:unknown){this.onmessage?.({data} as MessageEvent);}
 fail(message='late worker error'){this.onerror?.({message} as ErrorEvent);}
}

test('pack request defaults are valid identifiers and preserve the exact declared source closure',async()=>{
 expect(packDefaultOptions('123 Orders')).toEqual({schema:'_123_orders',package:'pack_123_orders'});
 const received=await runDomainPackTools(entries[0]!,entries,async value=>{expect(value).toEqual(request);return result;},{schema:'public',package:'demo_pack',targets:['ddl']});
 expect(received).toBe(result);
 expect(request.pack.text).toBe(packText);
 expect(request.sources).toEqual([{id:'items',path:'schemas/items.json',format:'json',schemaFormat:'tablespec',text:'{"tables":[]}'}]);
});

test('worker cancellation rejects the old request and a late old-worker error cannot cancel a replacement',async()=>{
 const workers:MockWorker[]=[];
 const client=new PackToolsWorkerClient('/assets/pack-tools/umf_core_wasm.js',()=>{const worker=new MockWorker();workers.push(worker);return worker as unknown as Worker;});
 const first=Promise.resolve(client.generate(request)),old=workers[0]!;
 const settled=first.then(()=>undefined,(error:Error)=>error);
 client.cancel();const failure=await settled;expect(failure).toMatchObject({code:'PACK_TOOLS_CANCELLED'});expect(old.terminated).toBe(true);
 const second=Promise.resolve(client.generate(request)),current=workers[1]!;
 old.fail('old worker error');
 expect(current.terminated).toBe(false);
 current.send({protocol:'umf.pack-tools-worker/1',id:2,ok:true,result});
 expect(await second).toBe(result);
 client.dispose();
});

test('ZIP archive keeps every generated file path and UTF-8 file body',()=>{
 const archive=packToolsZip({...result,files:[...result.files,{path:'demo_pack/models.py',text:'name = "café"\n',sha256:'c'.repeat(64),kind:'orm'}]});
 const view=new DataView(archive.buffer,archive.byteOffset,archive.byteLength),decoder=new TextDecoder();
 let offset=0;const files:Array<[string,string]>=[];
 while(offset+4<=archive.length&&view.getUint32(offset,true)===0x04034b50){const size=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true),nameStart=offset+30,dataStart=nameStart+nameLength+extraLength;const name=decoder.decode(archive.subarray(nameStart,nameStart+nameLength)),body=decoder.decode(archive.subarray(dataStart,dataStart+size));files.push([name,body]);offset=dataStart+size;}
 expect(files).toEqual([['schema.sql','CREATE TABLE x ();\n'],['demo_pack/models.py','name = "café"\n']]);
 expect(view.getUint32(offset,true)).toBe(0x02014b50);
});
