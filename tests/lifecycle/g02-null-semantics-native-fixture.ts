// SPDX-License-Identifier: MIT OR Apache-2.0
/** Reproducible G02 intrinsic-NULL and nullable-comparison native cases. */
import fixture from '../binding/fixtures/table-lifecycle-note.json';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges} from '../../src/table-migration';

const ref=(element:string)=>({module:'demo',element});
const configuration={module:'demo',schema:'g02_native',ownerRole:'g02_owner',personRole:'g02_person',batchRole:'g02_batch',groupRoles:{}};
const rows=[{id:'a',owner:'g02_alice',amount:null,tax:2},{id:'b',owner:'g02_bob',amount:'1.75',tax:3},{id:'c',owner:'g02_alice',amount:'0.50',tax:10}];
const lit=(value:unknown)=>({kind:'literal',value});
function source(target:'none'|'nullable'|'required',expression?:unknown){
 const doc=structuredClone(fixture) as any,module=doc.modules[0]!,payload=module.extensions['umf.tables'],table=payload.tables[0]!;
 module.elements.push({id:'amount',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'absent-allowed',facets:{precision:8,scale:2},extensions:{}});
 module.elements.push({id:'tax',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}});
 const record=module.elements.find((item:any)=>item.id==='Note')!;record.members.push(ref('amount'),ref('tax'));
 table.columns.push({field:ref('amount'),name:'amount',nativeType:{kind:'numeric',precision:8,scale:2}},{field:ref('tax'),name:'tax',nativeType:{kind:'int4'}});
 if(target!=='none'){
  module.elements.push({id:'total',kind:'field',scalarType:'decimal',cardinality:'one',nullability:target==='nullable'?'absent-allowed':'required',facets:{precision:16,scale:2},extensions:{}});record.members.push(ref('total'));
  table.columns.push({field:ref('total'),name:'total',nativeType:{kind:'numeric',precision:16,scale:2},default:{kind:'literal',value:{decimalToken:'0.00'}}});
 }
 if(expression!==undefined)payload.commands.push({version:'umf.table-operation/0.2',id:'derive_total',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:ref('total')},values:[{field:ref('total'),value:{kind:'rowExpression',expression}}],returning:[],maxRows:100}});
 payload.seedSets=[];return doc;
}
function deploy(doc:any){const result=compileTableDeployment({text:JSON.stringify(doc),configuration});if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));return result.bundle;}
const cases:any[]=[];
function addCase(id:string,sourceDoc:any,initialRows:any[],expectedRows:any[][],expectedFailure?:string,initialSourceDoc?:any){
 const initialBundle=deploy(initialSourceDoc??source('none'));
 const nextBundle=deploy(sourceDoc);
 const options:any={version:'umf.table-migration-options/0.4',backfills:[{table:'notes',column:ref('total'),operation:'derive_total',scopedRows:true}],concurrentIndexes:[],reviewedChanges:[],validations:[]};
 if(initialSourceDoc)options.reviewedChanges=discoverTableMigrationChanges(initialBundle,nextBundle).filter(x=>x.kind==='tighten-not-null').map(({oldValue:_a,newValue:_b,...marker})=>marker);
 const result=compileTableMigration({id:'g02-null-'+id,predecessor:{id:'g02-null-prior',digest:'f'.repeat(64)},previous:initialBundle,next:nextBundle,options});
 if(result.status!=='compiled')throw Error('G02 native plan refused '+id+': '+JSON.stringify(result.diagnostics));
 cases.push({id:'nullsem-'+id,source:nextBundle.source,initialSource:initialBundle.source,plan:{id:result.plan.id,options},initialRows,expectedRows,...(expectedFailure?{expectedFailure}:{})});
}
const nullLit={op:'literal',value:null};
for(const [op,expression] of [['add',{op:'add',left:nullLit,right:nullLit}],['concat',{op:'concat',args:[nullLit,nullLit]}]] as const){
 const target=op==='add'?'numeric':'text';
 const doc=source('required',expression);
 if(target==='text'){
  const field=doc.modules[0]!.elements.find((item:any)=>item.id==='total')!;field.scalarType='string';delete field.facets;
  const column=doc.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.name==='total')!;column.nativeType={kind:'text'};column.default={kind:'literal',value:{string:'0.00'}};
 }
 addCase('null-'+op+'-result',doc,rows,[],'null-result');
}
const conditional=(predicate:any)=>({op:'conditional',when:predicate,then:{op:'literal',value:{decimalToken:'1.00'}},else:{op:'literal',value:{decimalToken:'2.00'}}});
const controls:[string,any,any[][]][]=[
 ['eq-null',{op:'eq',field:ref('amount'),value:lit(null)},[['a','1.00'],['b','2.00'],['c','2.00']]],
 ['ne-null',{op:'ne',field:ref('amount'),value:lit(null)},[['a','2.00'],['b','1.00'],['c','1.00']]],
 ['eq-value',{op:'eq',field:ref('amount'),value:lit({decimalToken:'1.75'})},[['a','2.00'],['b','1.00'],['c','2.00']]],
 ['ne-value',{op:'ne',field:ref('amount'),value:lit({decimalToken:'1.75'})},[['a','1.00'],['b','2.00'],['c','1.00']]],
];
for(const [id,predicate,expected] of controls)for(const negate of [false,true])for(const shape of ['append','existing'] as const){
 const when=negate?{op:'not',arg:predicate}:predicate;
 const initial=shape==='existing'?source('nullable'):source('none');
 const next=source('required',conditional(when));
 const expectedRows=negate?expected.map(([key,value])=>[key,value==='1.00'?'2.00':'1.00']):expected;
 const initialRows=rows.map(row=>shape==='existing'?{...row,total:null}:row);
 addCase(`${shape}-${id}-${negate?'not':'direct'}`,next,initialRows,expectedRows,undefined,shape==='existing'?initial:undefined);
}
const wrongAdd=source('required',{op:'add',left:nullLit,right:nullLit});
wrongAdd.modules[0]!.elements.find((item:any)=>item.id==='total')!.scalarType='string';delete wrongAdd.modules[0]!.elements.find((item:any)=>item.id==='total')!.facets;
wrongAdd.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.name==='total')!.nativeType={kind:'text'};
const wrongConcat=source('required',{op:'concat',args:[nullLit,nullLit]});
wrongConcat.modules[0]!.elements.find((item:any)=>item.id==='total')!.scalarType='integer';delete wrongConcat.modules[0]!.elements.find((item:any)=>item.id==='total')!.facets;
wrongConcat.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.name==='total')!.nativeType={kind:'int4'};
wrongAdd.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.name==='total')!.default={kind:'literal',value:{string:'0.00'}};
wrongConcat.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.name==='total')!.default={kind:'literal',value:{integerToken:'0'}};
const validText=source('required',{op:'concat',args:[{op:'literal',value:{string:'a'}},{op:'literal',value:{string:'b'}}]});
validText.modules[0]!.elements.find((item:any)=>item.id==='total')!.scalarType='string';delete validText.modules[0]!.elements.find((item:any)=>item.id==='total')!.facets;
validText.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.name==='total')!.nativeType={kind:'text'};
validText.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.name==='total')!.default={kind:'literal',value:{string:'0.00'}};
const validInteger=source('required',{op:'add',left:{op:'literal',value:{integerToken:'1'}},right:{op:'literal',value:{integerToken:'2'}}});
validInteger.modules[0]!.elements.find((item:any)=>item.id==='total')!.scalarType='integer';delete validInteger.modules[0]!.elements.find((item:any)=>item.id==='total')!.facets;
validInteger.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.name==='total')!.nativeType={kind:'int4'};
validInteger.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.name==='total')!.default={kind:'literal',value:{integerToken:'0'}};
const compileOnlyControls=[] as any[];
for(const [id,doc,expected] of [
 ['add-null-null-wrong-text-target',wrongAdd,'domain-refusal'],
 ['concat-null-null-wrong-integer-target',wrongConcat,'domain-refusal'],
 ['valid-text-concat-target',validText,'compiled'],
 ['valid-integer-add-target',validInteger,'compiled'],
] as const){
 compileOnlyControls.push({id,source:{format:'json',utf8:JSON.stringify(doc)},expected});
}
await Bun.write(process.argv[2]??'/private/tmp/umf-g02-null-semantics-native-fixture.json',JSON.stringify({version:'umf.praxis.g02-null-semantics-native-fixture/1',configuration,cases,compileOnlyControls},null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,compileOnlyControls:compileOnlyControls.length}));
