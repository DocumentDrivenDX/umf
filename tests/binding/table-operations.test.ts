// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {generatePythonClient,inspectTableLifecycle,readDocument,writeDocument} from '../../src';
import {compileTableDeployment,verifyTableDeployment} from '../../src/table-deployment';
import {rowExpressionInputRefs} from '../../src/extensions/tables/row-expressions';
import {tableOperationSource} from '../unified/table-operation-fixture';
const ref=(element:string)=>({module:'demo',element});
const source=()=>tableOperationSource() as any;
const payload=(d:any)=>d.modules[0].extensions['umf.tables'];
const inspect=(d:any)=>inspectTableLifecycle(d);
const codes=(d:any)=>inspect(d).diagnostics.map(d=>d.code);
const addColumn=(d:any,id:string,scalarType:string,nativeType:any,extra:any={})=>{
 const module=d.modules[0],record=module.elements.find((element:any)=>element.kind==='record'),table=payload(d).tables[0];
 module.elements.push({id,kind:'field',scalarType,cardinality:'one',nullability:extra.nullability??'absent-allowed',extensions:{},...extra});
 record.members.push(ref(id));table.columns.push({field:ref(id),name:id,nativeType});
};
const backfill=(d:any,target:string,expression:any,where:any={op:'isNull',field:ref(target)})=>payload(d).commands.push({version:'umf.table-operation/0.2',id:'fill_'+target+'_'+payload(d).commands.length,parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',values:[{field:ref(target),value:{kind:'rowExpression',expression}}],where,returning:[],maxRows:10}});

test('CONTRACT-079/081: all declared result/write/conflict/batch shapes admit without execution authority',()=>{
 const d=source(),before=structuredClone(d),result=inspect(d);
 expect(result.diagnostics).toEqual([]);expect(result.valid&&result.complete).toBe(true);expect(result.nativeQualified).toBe(false);
 expect(payload(result.source).commands).toHaveLength(11);
 result.modules[0]!.payload.commands.length=0;expect(d).toEqual(before);expect(payload(result.source).commands).toHaveLength(11);
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(d,format),format);expect(restored).toEqual(d);expect(inspect(restored).complete).toBe(true);}
 const generated=generatePythonClient({text:JSON.stringify(d),package:'operation_demo'});
 expect(generated.description.nativeExecutionQualified).toBe(false);
 expect(generated.files.find(f=>f.path==='operation_demo/models.py')!.text).toContain('class DemoModule:');
 expect(d).toEqual(before);
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
 for(const mutate of [(c:any)=>c.body.cursorKey='missing',(c:any)=>{c.body.orderBy.push({field:ref('owner'),direction:'asc'});},(c:any)=>c.body.orderBy[0].field=ref('owner'),(c:any)=>c.body.fields=[ref('owner')]]){
  const d=source();const c=payload(d).commands.find((c:any)=>c.id==='read_page');
  mutate(c);expect(codes(d)).toContain('TABLES_OPERATION_PAGE');
 }
 const descending=source();payload(descending).commands.find((c:any)=>c.id==='read_page').body.orderBy[0].direction='desc';expect(inspect(descending).complete).toBe(true);
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
 for(const op of ['eq','ne']){const e=source(),c=payload(e).commands[0];e.modules[0].elements.find((x:any)=>x.id==='owner').nullability='absent-allowed';c.parameters=[];c.body.where={op,field:ref('owner'),value:{kind:'literal',value:null}};expect(inspect(e).diagnostics,`${op} retains nullable closed-predicate admission`).toEqual([]);}
});

test('module-wide operation predicate capacity refuses before interpreting an excess subtree',()=>{
 const d=source(),p=payload(d);p.commands=[p.commands[0]];
 const branch=()=>({op:'and',args:Array.from({length:100},()=>({op:'eq',field:ref('owner'),value:{kind:'parameter',parameter:'owner'}}))});
 p.commands[0].body.where={op:'or',args:Array.from({length:40},branch)};
 expect(inspect(d).complete).toBe(true);
 p.commands[0].body.where.args.push(branch());expect(codes(d)).toContain('TABLES_COMPLEXITY');
});

test('G02 operation 0.2 is a closed migration-only declaration with stable same-row input closure',()=>{
 const d=source(),p=payload(d);p.commands.push({version:'umf.table-operation/0.2',id:'backfill_owner',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',values:[{field:ref('owner'),value:{kind:'rowExpression',expression:{op:'concat',args:[{op:'field',field:ref('id')},{op:'literal',value:{string:'é é 😀  '}}]}}}],where:{op:'isNull',field:ref('owner')},returning:[],maxRows:100}});
 expect(inspect(d).diagnostics).toEqual([]);
 const expression=p.commands.at(-1).body.values[0].value.expression;
 expect(rowExpressionInputRefs({op:'conditional',when:{op:'and',args:[{op:'isNull',field:ref('owner')},{op:'eq',field:ref('id'),value:{kind:'literal',value:{string:'x'}}}]},then:{op:'field',field:ref('id')},else:{op:'field',field:ref('id')}} as any)).toEqual([ref('owner'),ref('id')]);
 const generated=generatePythonClient({text:JSON.stringify(d),package:'operation_demo'}),all=generated.files.map(file=>file.text).join('\n');
 expect(all).toContain('rename');expect(all).not.toMatch(/(?:async )?def backfill_owner\(/);expect(all).not.toContain('_TABLE_OPERATIONS[(\"demo\", \"backfill_owner\")]');
 const old=source();expect(inspect(old).complete).toBe(true);
});

test('G02 operation 0.2 refuses changed shape, ambient inputs, invalid Unicode, and bounded-AST violations',()=>{
 const valid=()=>{const d=source();payload(d).commands.push({version:'umf.table-operation/0.2',id:'backfill_owner',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',values:[{field:ref('owner'),value:{kind:'rowExpression',expression:{op:'field',field:ref('id')}}}],where:{op:'isNull',field:ref('owner')},returning:[],maxRows:1}});return d;};
 for(const mutate of [
  (c:any)=>c.batch={maxItems:1},(c:any)=>c.parameters=[{id:'x',field:ref('id')}],(c:any)=>c.body.where.field=ref('id'),
  (c:any)=>c.body.values[0].value.expression.future=true,(c:any)=>c.body.values[0].value.expression={op:'conditional',when:{op:'related',table:'notes',matches:[{source:ref('id'),target:ref('id')}],where:{op:'all'}},then:{op:'field',field:ref('id')},else:{op:'field',field:ref('id')}},
  (c:any)=>c.body.values[0].value.expression={op:'conditional',when:{op:'eq',field:ref('id'),value:{string:'x'}},then:{op:'field',field:ref('id')},else:{op:'field',field:ref('id')}},
  (c:any)=>c.body.values[0].value.expression={op:'literal',value:{string:'bad\u0000text'}},(c:any)=>c.body.values[0].value.expression={op:'literal',value:{string:'bad\ud800'}},
 ]){const d=valid();mutate(payload(d).commands.at(-1));expect(inspect(d).valid).toBe(false);}
 const cyclic:any={op:'coalesce',args:[]};cyclic.args.push(cyclic,{op:'field',field:ref('id')});expect(()=>rowExpressionInputRefs(cyclic)).toThrow(/Cyclic/);
 let deep:any={op:'field',field:ref('id')};for(let i=0;i<17;i++)deep={op:'coalesce',args:[deep,{op:'field',field:ref('id')}]};expect(()=>rowExpressionInputRefs(deep)).toThrow(/limit/);
});

test('G02 expression typing admits every operator family and literal-only condition predicates',()=>{
 const typed=(target:string,expression:any,extra:(d:any)=>void=()=>{})=>{const d=source();
  addColumn(d,'count','integer',{kind:'int4'});addColumn(d,'count_decimal','decimal',{kind:'numeric',precision:5,scale:0},{facets:{precision:5,scale:0}});
  addColumn(d,'amount','decimal',{kind:'numeric',precision:8,scale:2},{facets:{precision:8,scale:2}});addColumn(d,'flag','boolean',{kind:'boolean'});
  addColumn(d,'event_at','timestamp',{kind:'timestamptz'});addColumn(d,'instant_copy','timestamp',{kind:'timestamptz'});
  addColumn(d,'boolean_copy','boolean',{kind:'boolean'});
  addColumn(d,'event_day','date',{kind:'date'});addColumn(d,'date_copy','date',{kind:'date'});
  addColumn(d,'event_uuid','uuid',{kind:'uuid'});addColumn(d,'uuid_copy','uuid',{kind:'uuid'});
  addColumn(d,'display','string',{kind:'text'});addColumn(d,'display_limited','string',{kind:'text'},{allowedValues:[{string:'ok'}]});
  addColumn(d,'checked_display','string',{kind:'text'});d.modules[0].extensions['umf.tables'].tables[0].checks.push({id:'checked-display-ok',name:'checked_display_ok',expression:{op:'eq',left:{op:'field',field:ref('checked_display')},right:{op:'literal',value:{string:'ok'}}}});
  addColumn(d,'count_copy','integer',{kind:'int4'});addColumn(d,'amount_wide','decimal',{kind:'numeric',precision:12,scale:0},{facets:{precision:12,scale:0}});
  extra(d);backfill(d,target,expression);return inspect(d);};
 const lit=(value:any)=>({op:'literal',value}),field=(element:string)=>({op:'field',field:ref(element)});
 const good:Array<[string,any]>=[
  ['display',field('id')],['display',lit({string:'a'})],['display',{op:'coalesce',args:[lit(null),field('id')]}],
  ['display',{op:'concat',args:[field('id'),lit({string:' '}),field('owner')]}],
  ['count_copy',{op:'add',left:field('count'),right:lit({integerToken:'1'})}],
  ['count_copy',{op:'subtract',left:field('count'),right:lit({integerToken:'1'})}],
  ['count_copy',{op:'multiply',left:field('count'),right:lit({integerToken:'2'})}],
  ['count_copy',{op:'add',left:lit(null),right:lit(null)}],
  ['amount_wide',{op:'multiply',left:lit(null),right:lit(null)}],
  ['display',{op:'concat',args:[lit(null),lit(null)]}],
  ['count_copy',lit({integerToken:'1.0'})],['count_copy',lit({decimalToken:'1.0'})],
  ['count_copy',lit({decimalToken:'100e-2'})],['count_copy',lit({decimalToken:'-0e999999999999999999999999'})],
  ['count_copy',lit({decimalToken:'2e1'})],
  ['count_copy',{op:'coalesce',args:[lit(null),field('count')]}],
  ['count_copy',{op:'conditional',when:{op:'all'},then:lit(null),else:field('count')}],
  ['display',{op:'conditional',when:{op:'eq',field:ref('flag'),value:{kind:'literal',value:{boolean:true}}},then:field('id'),else:lit({string:'none'})}],
  ['display',{op:'conditional',when:{op:'in',field:ref('id'),values:[{kind:'literal',value:{string:'a'}},{kind:'literal',value:{string:'b'}}]},then:field('id'),else:lit({string:'none'})}],
  ['count_copy',field('count_decimal')],['amount_wide',lit({decimalToken:'1e10'})],
  ['instant_copy',{op:'coalesce',args:[lit(null),field('event_at')]}],['display',lit(null)],
  ['boolean_copy',field('flag')],['boolean_copy',lit({boolean:true})],
  ['boolean_copy',{op:'coalesce',args:[lit(null),field('flag')]}],
  ['boolean_copy',{op:'conditional',when:{op:'all'},then:field('flag'),else:lit({boolean:false})}],
  ['date_copy',field('event_day')],['date_copy',{op:'coalesce',args:[lit(null),field('event_day')]}],
  ['date_copy',{op:'conditional',when:{op:'all'},then:field('event_day'),else:lit({date:'2026-01-01'})}],
  ['uuid_copy',field('event_uuid')],['uuid_copy',{op:'coalesce',args:[lit(null),field('event_uuid')]}],
  ['uuid_copy',{op:'conditional',when:{op:'all'},then:field('event_uuid'),else:lit({uuid:'00000000-0000-0000-0000-000000000000'})}],
  ['display_limited',lit({string:'ok'})],
  ['checked_display',lit({string:'ok'})],
 ];
 for(const [target,expression]of good){const result=typed(target,expression);expect(result.valid,`${target}:${JSON.stringify(expression)} ${JSON.stringify(result.diagnostics)}`).toBe(true);}
});

test('G02 conditional predicates preserve NULL-safe equality and reject boolean/UUID ordering',()=>{
 const condition=(when:any)=>({op:'conditional',when,then:{op:'field',field:ref('id')},else:{op:'literal',value:{string:'fallback'}}});
 const nullValue={kind:'literal',value:null};
 for(const op of ['eq','ne'])for(const predicate of [
  {op,field:ref('owner'),value:nullValue},
  {op:'not',arg:{op,field:ref('owner'),value:nullValue}},
 ]){
  const d=source();addColumn(d,'display','string',{kind:'text'});d.modules[0].elements.find((x:any)=>x.id==='owner').nullability='absent-allowed';
  backfill(d,'display',condition(predicate));
  expect(inspect(d).valid,`${JSON.stringify(predicate)} ${JSON.stringify(inspect(d).diagnostics)}`).toBe(true);
 }
 for(const field of ['flag','event_uuid']){
  const d=source();addColumn(d,'display','string',{kind:'text'});addColumn(d,'flag','boolean',{kind:'boolean'});addColumn(d,'event_uuid','uuid',{kind:'uuid'});d.modules[0].elements.find((x:any)=>x.id===field).nullability='absent-allowed';
  const expression=condition({op:'lt',field:ref(field),value:nullValue});
  backfill(d,'display',expression);
  expect(inspect(d).valid,`${field} ordering with NULL must refuse`).toBe(false);
 }
});

test('G02 rejects incompatible branches and numeric bounds at every expression node',()=>{
 const typed=(target:string,expression:any)=>{const d=source();
  addColumn(d,'count','integer',{kind:'int4'});addColumn(d,'count_decimal','decimal',{kind:'numeric',precision:5,scale:0},{facets:{precision:5,scale:0}});
  addColumn(d,'amount_wide','decimal',{kind:'numeric',precision:1000,scale:1000},{facets:{precision:1000,scale:1000}});addColumn(d,'display','string',{kind:'text'});addColumn(d,'count_copy','integer',{kind:'int4'});addColumn(d,'ranged_count','integer',{kind:'int4'},{facets:{range:{min:{integerToken:'0'},max:{integerToken:'100'}}}});
  backfill(d,target,expression);return inspect(d);};
 const field=(element:string)=>({op:'field',field:ref(element)}),lit=(value:any)=>({op:'literal',value});
 for(const expr of [
  {op:'conditional',when:{op:'all'},then:field('id'),else:field('count')},
  {op:'coalesce',args:[field('id'),field('count')]},
 ])expect(typed('display',expr).valid).toBe(false);
 const integralDecimal=typed('count_copy',field('count_decimal'));expect(integralDecimal.valid,JSON.stringify(integralDecimal.diagnostics)).toBe(true);
 expect(typed('ranged_count',lit({integerToken:'9'})).valid).toBe(true);
 expect(typed('amount_wide',lit({decimalToken:'1e-1000'})).valid).toBe(true);
 expect(typed('count_copy',lit({decimalToken:'1.5'})).valid).toBe(false);
 expect(typed('count_copy',lit({integerToken:'1.2'})).valid).toBe(false);
 for(const target of ['display','flag','event_day'])expect(typed(target,{op:'add',left:lit(null),right:lit(null)}).valid,`NULL arithmetic must not acquire ${target} carrier`).toBe(false);
 expect(typed('count_copy',{op:'concat',args:[lit(null),lit(null)]}).valid).toBe(false);
 expect(typed('amount_wide',lit({integerToken:'1'.repeat(1001)})).diagnostics.map(x=>x.code)).toContain('TABLES_OPERATION_CAPACITY');
 expect(typed('amount_wide',lit({decimalToken:'1e-1001'})).diagnostics.map(x=>x.code)).toContain('TABLES_OPERATION_CAPACITY');
 const cancelled='0.'+'0'.repeat(2000)+'99999e2005';
 expect(typed('count_copy',lit({integerToken:cancelled})).valid).toBe(true);
 expect(typed('count_copy',lit({decimalToken:cancelled})).valid).toBe(true);
 expect(typed('count_copy',lit({decimalToken:'0.'+'0'.repeat(2001)+'99999e2005'})).valid).toBe(false);
 expect(typed('amount_wide',{op:'coalesce',args:[lit(null),{op:'coalesce',args:[lit({decimalToken:'1e-1001'}),field('amount_wide')]}]}).diagnostics.map(x=>x.code)).toContain('TABLES_OPERATION_CAPACITY');
 const tooMany={op:'conditional',when:{op:'in',field:ref('id'),values:Array.from({length:33},()=>({kind:'literal',value:{string:'x'}}))},then:field('id'),else:lit({string:'x'})};
 expect(()=>rowExpressionInputRefs(tooMany as any)).toThrow(/fanout/);
});
