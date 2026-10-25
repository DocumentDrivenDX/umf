// SPDX-License-Identifier: MIT OR Apache-2.0
/** G02 native carrier coverage, using a synthetic SD-007 Person adaptation. */
import fixture from '../binding/fixtures/table-lifecycle-note.json';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges,verifyTableMigration} from '../../src/table-migration';

const ref=(element:string)=>({module:'demo',element});
const configuration={module:'demo',schema:'g02_temporal',ownerRole:'g02_temporal_owner',personRole:'g02_temporal_person',batchRole:'g02_temporal_batch',groupRoles:{}};
type FixtureField={id:string;scalarType:'date'|'timestamp'|'uuid'|'boolean';nativeType:{kind:'date'|'timestamptz'|'uuid'|'boolean'};target?:true};
const fields:FixtureField[]=[
 {id:'birthDate',scalarType:'date',nativeType:{kind:'date'}},
 {id:'birthday',scalarType:'date',nativeType:{kind:'date'},target:true},
 {id:'sourceInstant',scalarType:'timestamp',nativeType:{kind:'timestamptz'}},
 {id:'occurredAt',scalarType:'timestamp',nativeType:{kind:'timestamptz'},target:true},
 {id:'sourceUuid',scalarType:'uuid',nativeType:{kind:'uuid'}},
 {id:'externalId',scalarType:'uuid',nativeType:{kind:'uuid'},target:true},
 {id:'sourceActive',scalarType:'boolean',nativeType:{kind:'boolean'}},
 {id:'active',scalarType:'boolean',nativeType:{kind:'boolean'},target:true},
] as const;
const refs=fields.map(field=>field.id);
const scalar=(value:string|boolean|null,kind:string)=>value===null?null:kind==='date'?{date:value}:kind==='timestamp'?{timestamp:value}:kind==='uuid'?{uuid:value}:kind==='boolean'?{boolean:value}:{string:value};
function source(requiredTarget?:string, expression?:unknown){
 const doc=structuredClone(fixture) as any,module=doc.modules[0]!,payload=module.extensions['umf.tables'],table=payload.tables[0]!,record=module.elements.find((item:any)=>item.id==='Note')!;
 table.id='people';table.name='people';table.record=ref('Person');record.id='Person';
 for(const field of fields){
  module.elements.push({id:field.id,kind:'field',scalarType:field.scalarType,cardinality:'one',nullability:field.target?(field.id===requiredTarget?'required':'absent-allowed'):'absent-allowed',extensions:{}});
  record.members.push(ref(field.id));table.columns.push({field:ref(field.id),name:field.id,nativeType:field.nativeType});
 }
const commandValues:[string,any][]=[['id',{string:'command-id'}],['owner',null]];
 for(const field of fields){
  const value=field.scalarType==='date'?'2000-01-01':field.scalarType==='timestamp'?'2000-01-02T03:04:05Z':field.scalarType==='uuid'?'00000000-0000-4000-8000-000000000001':false;
  commandValues.push([field.id,scalar(value,field.scalarType)]);
 }
 payload.commands=[{version:'umf.table-operation/0.1',id:'create_person',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'insert',table:'people',values:commandValues.map(([id,value])=>({field:ref(id),value:id==='owner'?{kind:'currentPrincipal'}:{kind:'literal',value}})),returning:[],maxRows:1}}];
 if(expression!==undefined)payload.commands.push({version:'umf.table-operation/0.2',id:'fill_'+requiredTarget,parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'people',where:{op:'isNull',field:ref(requiredTarget!)},values:[{field:ref(requiredTarget!),value:{kind:'rowExpression',expression}}],returning:[],maxRows:100}});
 payload.seedSets=[];return doc;
}
function deploy(doc:any){const result=compileTableDeployment({text:JSON.stringify(doc),configuration});if(result.status!=='compiled')throw Error('Temporal fixture deployment refused: '+JSON.stringify(result.diagnostics));return result.bundle;}
function makeCase(id:string,target:string,expression:any,initialRows:any[],expectedRows:any[][],expectedFailure?:string){
 const previous=deploy(source()),next=deploy(source(target,expression)),changes=discoverTableMigrationChanges(previous,next),marker=changes.find(change=>change.kind==='tighten-not-null'&&(change.oldValue as {physical?:{name?:string}}|undefined)?.physical?.name===target);
 if(!marker)throw Error('Missing requiredness marker for '+target+': '+JSON.stringify(changes));
 const {oldValue:_old,newValue:_new,...reviewed}=marker;
 const options={version:'umf.table-migration-options/0.4' as const,backfills:[{table:'people',column:ref(target),operation:'fill_'+target,scopedRows:true as const}],concurrentIndexes:[],reviewedChanges:[reviewed],validations:[]};
 const plan=compileTableMigration({id:'g02-temporal-'+id,predecessor:{id:'g02-temporal-initial',digest:'f'.repeat(64)},previous,next,options});
 if(plan.status!=='compiled')throw Error('Temporal fixture migration refused '+id+': '+JSON.stringify(plan.diagnostics));
 if(verifyTableMigration(plan.plan).digest!==plan.plan.digest)throw Error('Temporal fixture plan failed verification: '+id);
 const previousCommands=JSON.parse(previous.source.utf8).modules[0].extensions['umf.tables'].commands;
 const nextCommands=JSON.parse(next.source.utf8).modules[0].extensions['umf.tables'].commands;
 if(JSON.stringify(previousCommands[0])!==JSON.stringify(nextCommands[0]))throw Error('Retained .1 create command changed in '+id);
 return {id:'temporal-'+id,initialSource:previous.source,source:next.source,plan:{id:plan.plan.id,options},initialRows,expectedRows,...(expectedFailure?{expectedFailure}:{})};
}
const person=(id:string,birthDate:string|null,birthday:string|null,sourceInstant:string|null,occurredAt:string|null,sourceUuid:string|null,externalId:string|null,sourceActive:boolean|null,active:boolean|null)=>({id,owner:id==='p2'?'g02_bob':'g02_alice',birthDate,birthday,sourceInstant,occurredAt,sourceUuid,externalId,sourceActive,active});
const cases=[
 makeCase('birthday-date-coalesce','birthday',{op:'coalesce',args:[{op:'field',field:ref('birthDate')},{op:'literal',value:{date:'2000-02-29'}}]},[
  person('p1','2012-03-04',null,null,null,null,null,null,null),person('p2',null,null,null,null,null,null,null,null),person('p3','1999-12-31','2020-05-06',null,null,null,null,null,null),
 ],[
  ['p1','g02_alice','2012-03-04','2012-03-04',null,null,null,null,null,null],
  ['p2','g02_bob',null,'2000-02-29',null,null,null,null,null,null],
  ['p3','g02_alice','1999-12-31','2020-05-06',null,null,null,null,null,null],
 ]),
 makeCase('instant-copy-coalesce','occurredAt',{op:'coalesce',args:[{op:'field',field:ref('sourceInstant')},{op:'literal',value:{timestamp:'2025-01-02T03:04:05.123456Z'}}]},[
  person('p1',null,null,'2020-07-08T09:10:11.123456Z',null,null,null,null,null),person('p2',null,null,null,null,null,null,null,null),person('p3',null,null,'1998-01-02T03:04:05Z','2019-04-05T06:07:08Z',null,null,null,null),
 ],[
  ['p1','g02_alice',null,null,'2020-07-08 09:10:11.123456+00','2020-07-08 09:10:11.123456+00',null,null,null,null],
  ['p2','g02_bob',null,null,null,'2025-01-02 03:04:05.123456+00',null,null,null,null],
  ['p3','g02_alice',null,null,'1998-01-02 03:04:05+00','2019-04-05 06:07:08+00',null,null,null,null],
 ]),
 makeCase('uuid-copy-coalesce','externalId',{op:'coalesce',args:[{op:'field',field:ref('sourceUuid')},{op:'literal',value:{uuid:'00000000-0000-4000-8000-000000000009'}}]},[
  person('p1',null,null,null,null,'00000000-0000-4000-8000-000000000001',null,null,null),person('p2',null,null,null,null,null,null,null,null),person('p3',null,null,null,null,'00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004',null,null),
 ],[
  ['p1','g02_alice',null,null,null,null,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',null,null],
  ['p2','g02_bob',null,null,null,null,null,'00000000-0000-4000-8000-000000000009',null,null],
  ['p3','g02_alice',null,null,null,null,'00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004',null,null],
 ]),
 makeCase('boolean-copy-coalesce','active',{op:'coalesce',args:[{op:'field',field:ref('sourceActive')},{op:'literal',value:{boolean:true}}]},[
  person('p1',null,null,null,null,null,null,false,null),person('p2',null,null,null,null,null,null,null,null),person('p3',null,null,null,null,null,null,true,false),
 ],[
  ['p1','g02_alice',null,null,null,null,null,null,false,false],
  ['p2','g02_bob',null,null,null,null,null,null,null,true],
  ['p3','g02_alice',null,null,null,null,null,null,true,false],
 ]),
 makeCase('matched-null-date-rollback','birthday',{op:'field',field:ref('birthDate')},[
  person('p1','2012-03-04',null,null,null,null,null,null,null),person('p2',null,null,null,null,null,null,null,null),person('p3','1999-12-31',null,null,null,null,null,null,null),
 ],[],'null-result'),
];
const packet={version:'umf.g02-temporal-native-fixture/1',provenance:{domain:'SD-007 Person optional birthday example',adaptation:'synthetic native-RLS people table with unchanged owner/key shell; not an imported domain pack'},configuration,cases};
await Bun.write(process.argv[2]??'/private/tmp/g02-temporal-native-fixture.json',JSON.stringify(packet,null,2)+'\n');
console.log(JSON.stringify({version:packet.version,cases:cases.map(({id,plan})=>({id,command:plan.options.backfills[0]!.operation})),retainedCreateCommand:'create_person'}));
