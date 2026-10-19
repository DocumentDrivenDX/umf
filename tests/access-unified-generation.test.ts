// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {mkdtemp,readFile,writeFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generatePythonClient} from '../src/access';
import {checkAccessPackage,writeAccessPackage} from '../scripts/umf-access-generate';

const original=await Bun.file(new URL('./unified/commerce.json',import.meta.url)).text();
function changed(fn:(model:any)=>void){const model=JSON.parse(original);fn(model);return JSON.stringify(model);}

// @covers US-091-AC1 US-091-AC3 US-091-AC4 US-091-AC7 US-092-AC8
 test('current model generation preserves UUID/128/semantic metadata and closes selection',()=>{
 const text=changed(d=>{d.vocabularies['acme.terms']={version:'1.0.0'};d.modules[0].elements.find((e:any)=>e.id==='status').semanticTypes=[{vocabulary:'acme.terms',version:'1.0.0',term:'order-status'}];});
 const result=generatePythonClient({text,package:'shop'});
 const metadata=result.description.records as any;
 expect(metadata['commerce.Customer'].fields.map((f:any)=>f.scalar)).toContain('uuid');
 expect(metadata['commerce.Customer'].fields.map((f:any)=>f.scalar)).toContain('bits128');
 expect(metadata['commerce.Order'].fields.find((f:any)=>f.id==='status').semanticTypes).toEqual([{vocabulary:'acme.terms',version:'1.0.0',term:'order-status'}]);
 expect(result.description.relationships).toHaveLength(2);
 const models=result.files.find(f=>f.path==='shop/models.py')!.text;
 expect(models).toContain('orders: Relationship[Customer, Order, CustomerKey, OrderKey]');
 const selected=generatePythonClient({text,package:'shop',records:[{module:'commerce',element:'Order'}],actions:[]});
 const selectedModels=selected.files.find(f=>f.path==='shop/models.py')!.text;
 expect(selectedModels).toContain('class CustomerKey:');expect(selectedModels).not.toContain('class Customer:');
 expect(selectedModels).not.toContain('customer: Relationship[');
});

// @covers US-091-AC7 US-092-AC8
 test('unsupported selected meanings and naming collisions refuse before producing code',()=>{
 for(const text of [
  changed(d=>{d.modules[0].elements[0].scalarType='alien';}),
  ...['constructor','toString','__proto__'].map(scalar=>changed(d=>{d.modules[0].elements[0].scalarType=scalar;})),
  changed(d=>{d.modules[0].elements[0].nullability='unspecified';}),
  changed(d=>{delete d.modules[0].elements[0].nullability;}),
  changed(d=>{d.modules[0].elements[0].nullability='future';}),
  changed(d=>{delete d.modules[0].elements[0].cardinality;}),
  changed(d=>{d.modules[0].elements[0].cardinality='future';}),
  changed(d=>{d.modules[0].elements[1].extensions['alien.rules']={expression:'fetch("https://invalid.example")'};}),
  changed(d=>{d.modules[0].elements[1].name='customerId';}),
  changed(d=>{d.modules[0].extensions['umf.actions'].actions[0].parameters[0].name='idempotency_key';}),
  changed(d=>{d.modules[0].elements[0].semanticTypes=[{vocabulary:'acme.terms',version:'1.0.0',term:'x',unknown:true}];d.vocabularies['acme.terms']={version:'1.0.0'};}),
 ])expect(()=>generatePythonClient({text,package:'shop'})).toThrow();
 expect(()=>generatePythonClient({text:original,package:'../../escape'})).toThrow();
 expect(()=>generatePythonClient({text:original,package:'uuid'})).toThrow();
});

// @covers US-092-AC9
 test('existing output writer checks drift, refuses hand edits and restores failed swaps',async()=>{
 const result=generatePythonClient({text:original,package:'shop'}),candidate={outcome:'candidate' as const,files:result.files};
 const root=await mkdtemp(join(await realpath(tmpdir()),'umf-current-writer-')),output=join(root,'output');
 await writeAccessPackage(output,candidate);
 expect(await checkAccessPackage(output,candidate)).toEqual([]);
 const path=join(output,'shop/models.py'),before=await readFile(path,'utf8');
 await writeFile(path,before+'# manual edit\n');
 expect(await checkAccessPackage(output,candidate)).toEqual(['shop/models.py']);
 await expect(writeAccessPackage(output,candidate)).rejects.toMatchObject({code:'OUTPUT_CHANGED'});
 await writeFile(path,before);
 const replacement={outcome:'candidate' as const,files:generatePythonClient({text:original+'\n',package:'shop'}).files};
 await expect(writeAccessPackage(output,replacement,{fault:stage=>{if(stage==='before-install-rename')throw new Error('injected writer fault');}})).rejects.toThrow();
 expect(await checkAccessPackage(output,candidate)).toEqual([]);
});

// @covers US-091-AC7
test('sync and async public client names remain reserved',()=>{
 for(const symbol of ['SyncClient','AsyncClient','SyncActions','AsyncActions','SyncTransport','AsyncTransport','SyncQuery']){
  const text=changed(d=>{d.modules[0].elements.find((e:any)=>e.kind==='record').name=symbol;});
  expect(()=>generatePythonClient({text,package:'shop'})).toThrow();
 }
});
