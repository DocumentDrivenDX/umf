// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {generatePythonClient,inspectTableLifecycle,readDocument,writeDocument} from '../../src';
import {compileTableDeployment,verifyTableDeployment} from '../../src/table-deployment';
import {tableOperationSource} from '../unified/table-operation-fixture';
const ref=(element:string)=>({module:'demo',element});
const source=()=>tableOperationSource() as any;
const payload=(d:any)=>d.modules[0].extensions['umf.tables'];
const inspect=(d:any)=>inspectTableLifecycle(d);
const codes=(d:any)=>inspect(d).diagnostics.map(d=>d.code);

test('CONTRACT-079/081: all declared result/write/conflict/batch shapes admit without execution authority',()=>{
 const d=source(),before=structuredClone(d),result=inspect(d);
 expect(result.diagnostics).toEqual([]);expect(result.valid&&result.complete).toBe(true);expect(result.nativeQualified).toBe(false);
 expect(payload(result.source).commands).toHaveLength(11);
 result.modules[0]!.payload.commands.length=0;expect(d).toEqual(before);expect(payload(result.source).commands).toHaveLength(11);
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(d,format),format);expect(restored).toEqual(d);expect(inspect(restored).complete).toBe(true);}
 expect(()=>generatePythonClient({text:JSON.stringify(d),package:'operation_demo'})).toThrow('Native table lifecycle');
});

test('unknown operation versions and nested members retain exact source and block completeness',()=>{
 const mutations=[(c:any)=>c.future={keep:[1,null]},(c:any)=>c.body.where.future='keep',(c:any)=>c.body.fields[0].future=true,(c:any)=>c.parameters[0].future=true,(c:any)=>c.body.where.value.future=true,(c:any)=>c.version='umf.table-operation/next'];
 for(const mutate of mutations){const d=source();mutate(payload(d).commands[0]);const result=inspect(d);expect(result.valid).toBe(true);expect(result.complete).toBe(false);expect(result.source).toEqual(d);}
});

test('malformed known declarations are errors before semantic traversal',()=>{
 for(const mutate of [(c:any)=>delete c.body,(c:any)=>c.parameters=null,(c:any)=>c.body.where={op:'eq'},(c:any)=>c.body.maxRows=0,(c:any)=>c.body.sql='SELECT anything',(c:any)=>c.body.kind='future']){
  const d=source();mutate(payload(d).commands[0]);const result=inspect(d);
  if(payload(d).commands[0].body?.sql){expect(result.valid).toBe(true);expect(result.complete).toBe(false);}else{expect(result.valid).toBe(false);expect(codes(d)).toContain('TABLES_OPERATION_SHAPE');}
 }
});

test('operation and parameter identities, ownership, source projection and domains are exact',()=>{
 for(const [code,mutate]of [
  ['TABLES_DUPLICATE',(d:any)=>payload(d).commands.push(payload(d).commands[0])],
  ['TABLES_DUPLICATE',(d:any)=>payload(d).commands[0].parameters.push(payload(d).commands[0].parameters[0])],
  ['TABLES_OPERATION_TABLE',(d:any)=>payload(d).commands[0].body.table='foreign'],
  ['TABLES_OPERATION_FIELD',(d:any)=>payload(d).commands[0].body.fields[0]=ref('missing')],
  ['TABLES_OPERATION_PARAMETER',(d:any)=>payload(d).commands[0].body.where.value.parameter='missing'],
  ['TABLES_OPERATION_PARAMETER',(d:any)=>payload(d).commands[0].parameters[0].field.module='foreign'],
  ['TABLES_OPERATION_PARAMETER_UNUSED',(d:any)=>payload(d).commands[0].body.where={op:'all'}],
  ['TABLES_OPERATION_DOMAIN',(d:any)=>{d.modules[0].elements[1].nullability='absent-allowed';payload(d).commands[0].parameters[0].field=ref('id');}],
  ['TABLES_OPERATION_DOMAIN',(d:any)=>{payload(d).tables[0].columns[1].nativeType={kind:'varchar',length:20};payload(d).commands[0].parameters[0].field=ref('id');}],
 ] as [string,(d:any)=>void][]){const d=source();mutate(d);expect(codes(d)).toContain(code);}
});

test('count/cardinality/page result declarations cannot imply unstated ordering or identity',()=>{
 for(const mutate of [(c:any)=>c.body.cursorKey='missing',(c:any)=>{c.body.orderBy.push({field:ref('owner'),direction:'asc'});c.body.orderBy.reverse();},(c:any)=>c.body.orderBy[0].direction='desc',(c:any)=>c.body.orderBy[0].field=ref('owner'),(c:any)=>c.body.fields=[ref('owner')]]){
  const d=source();const c=payload(d).commands.find((c:any)=>c.id==='read_page');
  mutate(c);expect(codes(d)).toContain('TABLES_OPERATION_PAGE');
 }
 const d=source();payload(d).commands.find((c:any)=>c.id==='read_count').body.fields=[ref('id')];expect(codes(d)).toContain('TABLES_OPERATION_COUNT');
 const e=source();payload(e).commands[0].batch={maxItems:10};expect(codes(e)).toContain('TABLES_OPERATION_READ');
});

test('create completeness, generated/immutable keys, replay and conflict whitelist refuse unsafe declarations',()=>{
 for(const [code,mutate]of [
  ['TABLES_OPERATION_REQUIRED',(d:any)=>payload(d).commands.find((c:any)=>c.id==='create').body.values.pop()],
  ['TABLES_OPERATION_IMMUTABLE',(d:any)=>payload(d).commands.find((c:any)=>c.id==='rename').body.values[0].field=ref('id')],
  ['TABLES_OPERATION_GENERATED',(d:any)=>{d.modules[0].elements[0].scalarType='integer';payload(d).tables[0].columns[0].nativeType={kind:'int4'};payload(d).tables[0].columns[0].generated={kind:'identity',generation:'always'};}],
  ['TABLES_OPERATION_IMMUTABLE',(d:any)=>payload(d).tables[0].columns[1].immutable=true],
  ['TABLES_OPERATION_WRITE',(d:any)=>payload(d).commands.find((c:any)=>c.id==='create').replay='none'],
  ['TABLES_OPERATION_WRITE',(d:any)=>payload(d).commands.find((c:any)=>c.id==='create').consistency='statement'],
  ['TABLES_OPERATION_CONFLICT',(d:any)=>payload(d).commands.find((c:any)=>c.id==='put_update').body.conflictKey='missing'],
  ['TABLES_OPERATION_CONFLICT',(d:any)=>payload(d).commands.find((c:any)=>c.id==='put_update').body.updateFields=[ref('id')]],
  ['TABLES_OPERATION_CONFLICT',(d:any)=>payload(d).commands.find((c:any)=>c.id==='put_ignore').body.updateFields=[ref('owner')]],
  ['TABLES_OPERATION_CONFLICT',(d:any)=>payload(d).commands.find((c:any)=>c.id==='put_update').body.updateFields=[]],
 ] as [string,(d:any)=>void][]){const d=source();mutate(d);expect(codes(d)).toContain(code);}
});

test('native literals and global predicate depth/node bounds are checked without I/O',()=>{
 const d=source(),create=payload(d).commands.find((c:any)=>c.id==='create');create.parameters=[];create.body.values.forEach((a:any)=>a.value={kind:'literal',value:{string:'literal'}});expect(inspect(d).complete).toBe(true);
 create.body.values[0].value={kind:'literal',value:{integerToken:'1'}};expect(codes(d)).toContain('TABLES_LITERAL');
 const deep=source();let node:any={op:'all'};for(let i=0;i<18;i++)node={op:'not',arg:node};payload(deep).commands[0].body.where=node;expect(codes(deep)).toContain('TABLES_COMPLEXITY');
});

test('deployment preserves typed commands as inert source, with source-recomputed forgery refusal',()=>{
 const d=source(),configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{}};
 const compiled=compileTableDeployment({text:JSON.stringify(d),configuration});expect(compiled.status).toBe('compiled');
 if(compiled.status!=='compiled')throw Error(JSON.stringify(compiled));
 expect(verifyTableDeployment(compiled.bundle)).toEqual(compiled.bundle);
 expect(compiled.bundle.nativeQualified).toBe(false);expect(compiled.bundle.steps.some(s=>/^(INSERT|UPDATE|DELETE)/.test(s.sql))).toBe(false);
 expect(compiled.bundle.source.utf8).toBe(JSON.stringify(d));
});


test('composite page order and capacity bounds have independent valid controls',()=>{
 const d=source(),p=payload(d);p.commands=[p.commands.find((c:any)=>c.id==='read_page')];
 d.modules[0].elements[2].keys[0].fields.push(ref('owner'));
 p.commands[0].body.orderBy.push({field:ref('owner'),direction:'asc'});
 expect(inspect(d).complete).toBe(true);p.commands[0].body.orderBy.reverse();expect(codes(d)).toContain('TABLES_OPERATION_PAGE');
 for(const [id,change]of [
  ['read_many',(c:any)=>c.body.maxRows=1001],
  ['create',(c:any)=>c.body.maxRows=2],
  ['remove',(c:any)=>c.body.maxRows=10001],
  ['create_batch',(c:any)=>c.batch.maxItems=1001],
 ] as [string,(c:any)=>void][]){const e=source();change(payload(e).commands.find((c:any)=>c.id===id));expect(codes(e)).toContain('TABLES_OPERATION_SHAPE');}
 const e=source();payload(e).commands.find((c:any)=>c.id==='read_one').body.maxRows=2;expect(codes(e)).toContain('TABLES_OPERATION_RESULT');
});

test('defaulted create omission and each predicate shape retain explicit typed meaning',()=>{
 const d=source(),p=payload(d),create=p.commands.find((c:any)=>c.id==='create');
 create.body.values.pop();create.parameters.pop();expect(codes(d)).toContain('TABLES_OPERATION_REQUIRED');
 p.tables[0].columns[1].default={kind:'literal',value:{string:'declared'}};expect(inspect(d).complete).toBe(true);
 for(const where of [
  {op:'all'}, {op:'isNull',field:ref('owner')},
  {op:'and',args:[{op:'all'},{op:'or',args:[{op:'not',arg:{op:'all'}}]}]},
  {op:'in',field:ref('owner'),values:[{kind:'literal',value:{string:'a'}},{kind:'literal',value:{string:'b'}}]},
  ...['eq','ne','lt','le','gt','ge','startsWith'].map(op=>({op,field:ref('owner'),value:{kind:'literal',value:{string:'a'}}})),
 ]){const e=source(),c=payload(e).commands[0];c.parameters=[];c.body.where=where;expect(inspect(e).diagnostics).toEqual([]);}
});

test('module-wide operation predicate capacity refuses before interpreting an excess subtree',()=>{
 const d=source(),p=payload(d);p.commands=[p.commands[0]];
 const branch=()=>({op:'and',args:Array.from({length:100},()=>({op:'eq',field:ref('owner'),value:{kind:'parameter',parameter:'owner'}}))});
 p.commands[0].body.where={op:'or',args:Array.from({length:40},branch)};
 expect(inspect(d).complete).toBe(true);
 p.commands[0].body.where.args.push(branch());expect(codes(d)).toContain('TABLES_COMPLEXITY');
});
