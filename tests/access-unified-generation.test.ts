// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {mkdtemp,readFile,writeFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generatePythonClient} from '../src/access';
import {checkAccessPackage,writeAccessPackage} from '../scripts/umf-access-generate';

const original=await Bun.file(new URL('./unified/commerce.json',import.meta.url)).text();
const praxis=await Bun.file(new URL('./unified/praxis/catalog.json',import.meta.url)).text();
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

test('known hohfeld.view field annotations are retained as opaque presentation metadata',()=>{
 const model=JSON.parse(praxis),delivery=model.modules[0].elements.find((e:any)=>e.id==='Solution.deliveryMode');
 const expected=structuredClone(delivery.extensions['hohfeld.view']);
 const result=generatePythonClient({text:JSON.stringify(model),package:'praxis'});
 const field=(result.description.records as any)['catalog.Solution'].fields.find((item:any)=>item.id==='Solution.deliveryMode');
 expect(field.extensions).toEqual({'hohfeld.view':expected});
 expect(field.extensionInterpretation).toBe('opaque-presentation-metadata-only');
 expect(()=>generatePythonClient({text:JSON.stringify({...model,modules:model.modules.map((m:any)=>({...m,elements:m.elements.map((e:any)=>e.id==='Solution.deliveryMode'?{...e,extensions:{...e.extensions,'alien.presentation':{tone:'red'}}}:e)}))}),package:'praxis'})).toThrow();
});

test('current Praxis handler declarations generate typed methods and omit MISSING optional values',async()=>{
 const model=JSON.parse(praxis),ids=['AddUseCase','AddSolution','AddProduct','SetSolutionProvider','AssertCoverage','CorrectUseCase','RenameUseCase','CorrectSolution','RenameSolution','ChangeSolutionDelivery','RetireSolution','CorrectProduct','RenameProduct','ChangeCoverageLevel','RetireCoverage','AddProductVersion','AddFinding','SetFindingVersion','ApplyFindingTo','RelateFindingTo'];
 const result=generatePythonClient({text:praxis,package:'praxis'}),metadata=result.description.actions as Record<string,any>;
 expect(Object.keys(metadata).sort()).toEqual(ids.map(id=>'catalog.'+id).sort());
 const models=result.files.find(file=>file.path==='praxis/models.py')!.text;
 for(const id of ids){
  expect(metadata['catalog.'+id].declaration.binding.kind).toBe('handler');
  expect(metadata['catalog.'+id].declaration.outputs).toEqual([]);
  const method=id.replace(/([a-z0-9])([A-Z])/g,'$1_$2').toLowerCase();
  expect(models).toContain(`async def ${method}(`);
  expect(models).toContain(`await self._client.apply("catalog.${id}"`);
 }
 expect(models).toContain('summary: str | None | Missing = MISSING');
 expect(models).toContain('use_case: UseCaseKey');
 const root=await mkdtemp(join(await realpath(tmpdir()),'umf-praxis-access-'));
 for(const file of result.files){const path=join(root,file.path);await Bun.write(path,file.text);}
 const program=`import asyncio, sys\nsys.path.insert(0, ${JSON.stringify(root)})\nfrom praxis import Actions, Client\nclass Transport:\n def __init__(self): self.request_value = None\n async def execute(self, value):\n  self.request_value = value\n  return {'schema':value['schema'],'consistency_token':'test-token','created':[],'changed':[],'counts':{}}\nasync def main():\n t=Transport(); actions=Actions(Client(t))\n await actions.add_use_case(code='UC-1', name='Test case')\n assert t.request_value['action']=='catalog.AddUseCase'\n assert t.request_value['inputs']=={'code':'UC-1','name':'Test case'}\nasyncio.run(main())\n`;
 const proc=Bun.spawn([process.env.UMF_UNIFIED_PYTHON??'python3.11','-S','-c',program],{cwd:root,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,exitCode]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);
 expect({exitCode,stdout,stderr}).toEqual({exitCode:0,stdout:'',stderr:''});
});

// @covers US-091-AC7
test('runtime reexports reserve their actual generated namespace',()=>{
 const generated=generatePythonClient({text:original,package:'shop'});
 const init=generated.files.find(file=>file.path==='shop/__init__.py')!.text;
 const runtimeNames=init.match(/from \._runtime import ([^\n]+)/)![1]!.split(', ').map(binding=>binding.split(' as ')[1]!);
 expect(runtimeNames).toEqual(expect.arrayContaining(['AccessError','Unsupported','SchemaMismatch','PreconditionFailed','WriteOutcomeUnknown']));
 for(const symbol of new Set([...runtimeNames.filter(symbol=>symbol[0]===symbol[0]!.toUpperCase()),'SyncClient','AsyncClient','SyncActions','AsyncActions','SyncQuery'])){
  const text=changed(d=>{d.modules[0].elements.find((e:any)=>e.kind==='record').name=symbol;});
  expect(()=>generatePythonClient({text,package:'shop'})).toThrow();
 }
 const normalized=generatePythonClient({text:changed(d=>{d.modules[0].elements.find((e:any)=>e.kind==='record').name='write_outcomes_unknown';}),package:'shop'});
 expect(normalized.files.find(file=>file.path==='shop/models.py')!.text).toContain('class WriteOutcomesUnknown:');
 for(const text of [
  changed(d=>{d.modules[0].extensions['umf.actions'].actions[0].parameters[0].name='write_outcomes_unknown';}),
  changed(d=>{d.modules[0].elements.find((e:any)=>e.kind==='field').name='write_outcomes_unknown';}),
 ])expect(()=>generatePythonClient({text,package:'shop'})).toThrow();
});
