// SPDX-License-Identifier: MIT OR Apache-2.0
/** Synthetic G02 PostgreSQL inputs with a hand-computed exact row oracle. */
import fixture from '../binding/fixtures/table-lifecycle-note.json';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration} from '../../src/table-migration';

const ref=(element:string)=>({module:'demo',element});
const configuration={module:'demo',schema:'g02_native',ownerRole:'g02_owner',personRole:'g02_person',batchRole:'g02_batch',groupRoles:{}};
const rows=[{id:'a',owner:'g02_alice',amount:'10.25',tax:2},{id:'b',owner:'g02_bob',amount:'1.75',tax:3},{id:'c',owner:'g02_alice',amount:'0.50',tax:10}];
function source(withTarget=false){
 const doc=structuredClone(fixture) as any,module=doc.modules[0]!,payload=module.extensions['umf.tables'],table=payload.tables[0]!;
 module.elements.push({id:'amount',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'absent-allowed',facets:{precision:8,scale:2},extensions:{}});
 module.elements.push({id:'tax',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}});
 const record=module.elements.find((item:any)=>item.id==='Note')!;record.members.push(ref('amount'),ref('tax'));
 table.columns.push({field:ref('amount'),name:'amount',nativeType:{kind:'numeric',precision:8,scale:2}},{field:ref('tax'),name:'tax',nativeType:{kind:'int4'}});
 if(withTarget){
  module.elements.push({id:'total',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'required',facets:{precision:16,scale:2},extensions:{}});record.members.push(ref('total'));
  table.columns.push({field:ref('total'),name:'total',nativeType:{kind:'numeric',precision:16,scale:2},default:{kind:'literal',value:{decimalToken:'0.00'}}});
  payload.commands.push({version:'umf.table-operation/0.2',id:'derive_total',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:ref('total')},values:[{field:ref('total'),value:{kind:'rowExpression',expression:{op:'add',left:{op:'field',field:ref('amount')},right:{op:'field',field:ref('tax')}}}}],returning:[],maxRows:100}});
 }
 payload.seedSets=[];return doc;
}
function deploy(doc:any){const result=compileTableDeployment({text:JSON.stringify(doc),configuration});if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));return result.bundle;}
const previous=deploy(source()),next=deploy(source(true));
const result=compileTableMigration({id:'g02-native-002',predecessor:{id:'g02-native-001',digest:'f'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.4',backfills:[{table:'notes',column:ref('total'),operation:'derive_total',scopedRows:true}],concurrentIndexes:[],reviewedChanges:[],validations:[]}});
if(result.status!=='compiled')throw Error('G02 native plan refused: '+JSON.stringify(result.diagnostics));
const cases=[
 {id:'exact-decimal-per-row',initialRows:rows,expectedRows:[['a','12.25'],['b','4.75'],['c','10.50']]},
 {id:'null-derived-result-rolls-back',initialRows:[...rows.slice(0,2),{id:'c',owner:'g02_alice',amount:null,tax:10}],expectedFailure:'null-result',expectedRows:[]},
];
await Bun.write(process.argv[2]??'/private/tmp/umf-g02-derived-fill-native-fixture.json',JSON.stringify({version:'umf.praxis.g02-derived-fill-native-fixture/1',configuration,initialSource:previous.source,source:next.source,plan:result.plan,cases},null,2)+'\n');
console.log(JSON.stringify({version:result.plan.version,executionProfile:result.plan.executionProfile,phases:result.plan.phases?.map(phase=>phase.kind),rows:cases[0]!.expectedRows}));
