// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {copyJson,generatePythonClient,inspectTableLifecycle,readDocument,writeDocument,tableLifecycleRegistry,type Document} from '../../src';
import schema from '../../spec/extensions/tables/schema.json';
import manifest from '../../spec/extensions/tables/package.json';
import noteFixture from './fixtures/table-lifecycle-note.json';
const ref=(element:string)=>({module:'demo',element});
const field=(id:string,scalarType='string')=>({id,kind:'field',scalarType,cardinality:'one',nullability:'required',extensions:{}});
const owner=(name='owner')=>({kind:'owner',field:ref(name)});
const policy=()=>({mode:'native-rls',person:Object.fromEntries(['select','insert','update','delete'].map(c=>[c,owner()])),batch:{select:{kind:'allow'},insert:{kind:'deny'},update:{kind:'deny'},delete:{kind:'deny'}}});
const table=()=>({id:'notes',record:ref('Note'),name:'notes',columns:[{field:ref('id'),name:'id',nativeType:{kind:'text'}},{field:ref('owner'),name:'owner',nativeType:{kind:'text'}}],indexes:[],checks:[],foreignKeys:[],policy:policy()});
function source():Document{return copyJson(noteFixture) as unknown as Document;}
const payload=(doc:Document):any=>doc.modules[0]!.extensions!['umf.tables'];
const codes=(doc:Document)=>inspectTableLifecycle(doc).diagnostics.map(d=>d.code);

test('CONTRACT-081: explicit schema and metadata admission never imply native qualification',()=>{
 expect(manifest.schema).toEqual(schema);expect(tableLifecycleRegistry().get('umf.tables','0.1.0')).toBeDefined();
 const input=source(),before=copyJson(input) as unknown as Document,result=inspectTableLifecycle(input);
 expect(result.diagnostics).toEqual([]);expect(result.valid).toBe(true);expect(result.complete).toBe(true);expect(result.nativeQualified).toBe(false);
 result.modules[0]!.payload.tables[0]!.name='edited';expect(input).toEqual(before);expect(((result.source as unknown as Document).modules[0]!.extensions!['umf.tables'] as any).tables[0].name).toBe('notes');
});

test('CONTRACT-081: unknown top-level and nested policy/type/check content survives both formats and blocks interpretation',()=>{
 const input=source(),p=payload(input);p.future={native:['retain',42]};p.tables[0].columns[0].nativeType.future={mode:'retained'};p.tables[0].policy.person.select.future='retained';
 p.tables[0].checks=[{id:'owner-check',name:'owner_check',expression:{op:'eq',left:{op:'field',field:ref('owner')},right:{op:'literal',value:{string:'owner'},future:true}}}];
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(input,format),format),result=inspectTableLifecycle(restored);expect(restored).toEqual(input);expect(result.valid).toBe(true);expect(result.complete).toBe(false);expect(result.diagnostics.filter(d=>d.code==='TABLES_UNKNOWN').length).toBe(4);}
});

test('CONTRACT-081: native namespaces, field ownership, complete mappings and exact Record identities are checked',()=>{
 const cases:[string,(p:any,d:Document)=>void][]=[
  ['TABLES_IDENTIFIER',p=>p.tables[0].columns[0].name='é'.repeat(32)],
  ['TABLES_DUPLICATE',p=>p.tables[0].columns.push(p.tables[0].columns[0])],
  ['TABLES_COLUMN_MISSING',p=>p.tables[0].columns.pop()],
  ['TABLES_RECORD',p=>p.tables[0].record.module='foreign'],
  ['TABLES_NATIVE_TYPE',p=>p.tables[0].columns[0].nativeType={kind:'int8'}],
  ['TABLES_RELATION_NAME',p=>p.tables[0].indexes.push({id:'one',name:'notes',fields:[ref('id')],include:[],unique:false})],
  ['TABLES_INDEX_OVERLAP',p=>p.tables[0].indexes.push({id:'one',name:'notes_idx',fields:[ref('id')],include:[ref('id')],unique:false})],
  ['TABLES_POLICY_FIELD',p=>p.tables[0].policy.person.select.field=ref('missing')],
  ['TABLES_POLICY_SELECT',p=>p.tables[0].policy.person.select={kind:'deny'}],
  ['TABLES_KEY_MUTABILITY',p=>p.tables[0].columns[0].immutable=false],
 ];
 for(const[code,mutate]of cases){const input=source();mutate(payload(input),input);expect(codes(input)).toContain(code);expect(inspectTableLifecycle(input).complete).toBe(false);}
});

test('CONTRACT-081: exact literals, native capacities, generated columns and Boolean checks refuse bad input',()=>{
 const input=source(),p=payload(input),record=input.modules[0]!.elements.find(e=>e.id==='Note')!;
 input.modules[0]!.elements.push({...field('amount','decimal'),facets:{precision:8,scale:3}} as any);record.members!.push(ref('amount'));
 p.tables[0].columns.push({field:ref('amount'),name:'amount',nativeType:{kind:'numeric',precision:5,scale:2},default:{kind:'literal',value:{decimalToken:'12.30'}}});
 expect(inspectTableLifecycle(input).diagnostics).toEqual([]);
 p.tables[0].columns[2].default.value={decimalToken:'12.301'};expect(codes(input)).toContain('TABLES_NATIVE_CAPACITY');
 p.tables[0].columns[2].default.value={decimalToken:'1000.00'};expect(codes(input)).toContain('TABLES_NATIVE_CAPACITY');
 p.tables[0].columns[2].default.value={decimalToken:'12.30'};
 p.tables[0].checks=[{id:'bad',name:'bad',expression:{op:'field',field:ref('owner')}}];expect(codes(input)).toContain('TABLES_CHECK_TYPE');
 p.tables[0].checks[0].expression={op:'eq',left:{op:'field',field:ref('owner')},right:{op:'literal',value:{integerToken:'1'}}};expect(codes(input)).toContain('TABLES_EXPRESSION_TYPE');
 p.tables[0].checks=[];p.tables[0].columns[0].generated={kind:'identity',generation:'always'};expect(codes(input)).toContain('TABLES_IDENTITY');
});

test('CONTRACT-081: seeds are explicit typed module data and opaque commands do not gain execution authority',()=>{
 const input=source(),p=payload(input);
 p.seedSets=[{id:'fixture',conflict:'error',rows:[{table:'notes',values:[{field:ref('id'),value:{string:'n1'}},{field:ref('owner'),value:{string:'owner'}}]}]}];
 expect(inspectTableLifecycle(input).diagnostics).toEqual([]);
 p.seedSets[0].rows[0].values[1].value={integerToken:'7'};expect(codes(input)).toContain('TABLES_LITERAL');
 p.seedSets[0].rows[0].values.pop();expect(codes(input)).toContain('TABLES_SEED_REQUIRED');
 p.seedSets=[];p.commands=[{future:'kept'}];expect(codes(input)).toContain('TABLES_COMMAND_PENDING');expect(inspectTableLifecycle(input).valid).toBe(true);expect(inspectTableLifecycle(input).complete).toBe(false);
});

test('CONTRACT-081: via requires explicit original relationship/FK custody and rejects cyclic/native module paths',()=>{
 const input=source(),p=payload(input),module=input.modules[0]!;
 module.elements.push(field('parentId') as any,field('parentOwner') as any,field('noteParentId') as any,{id:'Parent',kind:'record',members:[ref('parentId'),ref('parentOwner')],keys:[{id:'primary',name:'primary',primary:true,fields:[ref('parentId')]}],extensions:{}});
 module.elements.find(e=>e.id==='Note')!.members!.push(ref('noteParentId'));
 module.relationships=[{id:'parent',name:'parent',source:[ref('Note')],target:[{...ref('Parent'),key:'primary'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:1,max:1},targetLifecycle:'independent',directed:true} as any];
 const parent={...table(),id:'parents',record:ref('Parent'),name:'parents',columns:[{field:ref('parentId'),name:'id',nativeType:{kind:'text'}},{field:ref('parentOwner'),name:'owner',nativeType:{kind:'text'}}],policy:{...policy(),person:Object.fromEntries(['select','insert','update','delete'].map(c=>[c,owner('parentOwner')]))}};
 p.tables.push(parent);p.tables[0].columns.push({field:ref('noteParentId'),name:'parent_id',nativeType:{kind:'text'}});
 p.tables[0].foreignKeys=[{id:'parent_fk',name:'parent_fk',fields:[ref('noteParentId')],target:{record:ref('Parent'),key:'primary'},onUpdate:'restrict',onDelete:'restrict',deferrable:false,relationship:{module:'demo',id:'parent'}}];
 p.tables[0].policy.person.select={kind:'via',path:[{module:'demo',id:'parent',direction:'forward'}],rule:owner('parentOwner')};
 expect(inspectTableLifecycle(input).diagnostics).toEqual([]);
 delete p.tables[0].foreignKeys[0].relationship;expect(codes(input)).toContain('TABLES_POLICY_MAPPING');
 p.tables[0].foreignKeys[0].relationship={module:'demo',id:'parent'};
 p.tables[1].policy.person.select={kind:'via',path:[{module:'demo',id:'parent',direction:'inverse'}],rule:owner()};expect(codes(input)).toContain('TABLES_POLICY_CYCLE');
 p.tables[0].policy.person.select.path[0].module='foreign';expect(codes(input)).toContain('TABLES_POLICY_MODULE');
});

test('CONTRACT-081: malformed input, unknown revisions and bounded diagnostic exhaustion refuse without executable data',()=>{
 for(const value of [null,1,'text',[],{}, {...source(),umf:'0.9.0'}])expect(inspectTableLifecycle(value).valid).toBe(false);
 const input=source();Object.assign(payload(input),Object.fromEntries(Array.from({length:300},(_,i)=>['future'+i,true])));
 expect(codes(input)).toContain('TABLES_DIAGNOSTIC_LIMIT');expect(inspectTableLifecycle(input).valid).toBe(false);
 const cycle:any={};cycle.self=cycle;expect(inspectTableLifecycle(cycle).valid).toBe(false);
});

test('CONTRACT-081: client generation refuses lifecycle source until its operation interpretation is qualified',()=>{
 expect(()=>generatePythonClient({text:JSON.stringify(source()),package:'notes'})).toThrow('Native table lifecycle client interpretation is not qualified');
});

test('CONTRACT-081: an action cannot bypass pending table interpretation through an unselected module dependency',async()=>{
 const doc=JSON.parse(await Bun.file(new URL('../unified/commerce.json',import.meta.url)).text());
 const module=source().modules[0]!,actions=doc.modules[0].extensions['umf.actions'];
 module.extensions={'umf.actions':actions};doc.modules[0].extensions={};doc.modules.push(module);
 const request={text:JSON.stringify(doc),package:'mixed',records:[ref('Note')]};
 expect(generatePythonClient(request).sourceDigest.length).toBe(64);
 doc.vocabularies['umf.tables']={version:'0.1.0'};doc.modules[0].extensions['umf.tables']={profile:'postgresql18/0.1',tables:[],seedSets:[],commands:[]};
 expect(()=>generatePythonClient({...request,text:JSON.stringify(doc)})).toThrow('Native table lifecycle action interpretation is not qualified');
});
