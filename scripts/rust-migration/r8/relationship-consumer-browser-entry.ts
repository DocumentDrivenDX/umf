// SPDX-License-Identifier: MIT OR Apache-2.0
// Browser entry for the five consumers whose source routes need no Node parser backend.
import * as v4 from '../../../src/index-browser-v4';
import {projectRelationshipToAvro as refAvro} from '../../../src/core-ideals/relationship-avro-projection';
import {projectRelationshipToTableSpec as refTableSpec} from '../../../src/core-ideals/relationship-tablespec-projection';
import {projectRelationshipToSqlServer as refSqlServer} from '../../../src/core-ideals/relationship-sqlserver-projection';
import {projectRelationshipToParquet as refParquet} from '../../../src/core-ideals/relationship-parquet-projection';
import {projectRelationshipToExtra as refExtras} from '../../../src/core-ideals/relationship-extras';
import {relationshipAvroCase} from '../../core-ideals/relationship-avro-projection-cases';
import {relationshipTableSpecCase} from '../../core-ideals/relationship-tablespec-projection-cases';
import {relationshipSqlServerCase} from '../../core-ideals/relationship-sqlserver-cases';
import {relationshipExtraCases} from '../../core-ideals/relationship-extras-cases';

function getter<T extends object>(input:T,key:string,trace:string[],label:string):T{const copy=structuredClone(input);Object.defineProperty(copy,key,{enumerable:true,configurable:true,get(){trace.push(`${label}.${key}:get`);return null;}});return copy;}
const errorShape=(error:unknown)=>{const e=error as {name?:unknown;code?:unknown;path?:unknown;pointer?:unknown;message?:unknown};return {status:'threw',name:String(e?.name??''),code:typeof e?.code==='string'?e.code:null,path:typeof e?.path==='string'?e.path:null,pointer:typeof e?.pointer==='string'?e.pointer:null,message:String(e?.message??'')};};
function makeCases(){
 const rows:{id:string;consumer:string;trace:string[];run:(api:any)=>unknown}[]=[];
 for(const [name,caseName] of [['report.many-to-one','many-to-one'],['report.heterogeneous','heterogeneous']] as const){const c=relationshipAvroCase(caseName);rows.push({id:`avro.${name}`,consumer:'Avro',trace:[],run:a=>a.projectRelationshipToAvro(c.source,c.author,c.request)});}
 {const c=relationshipAvroCase(),trace:string[]=[];rows.push({id:'avro.request-accessor',consumer:'Avro',trace,run:a=>a.projectRelationshipToAvro(c.source,c.author,getter(c.request,'shape',trace,'request') as any)});}
 for(const [name,caseName] of [['report.many-to-one','many-to-one'],['report.heterogeneous','heterogeneous']] as const){const c=relationshipTableSpecCase(caseName);rows.push({id:`tablespec.${name}`,consumer:'TableSpec',trace:[],run:a=>a.projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,c.request)});}
 {const c=relationshipTableSpecCase(),trace:string[]=[];rows.push({id:'tablespec.request-accessor',consumer:'TableSpec',trace,run:a=>a.projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,getter(c.request,'mode',trace,'request') as any)});}
 for(const [name,caseName] of [['report.many-to-one','many-to-one'],['report.heterogeneous','heterogeneous']] as const){const c=relationshipSqlServerCase(caseName);rows.push({id:`sqlserver.${name}`,consumer:'SQL Server',trace:[],run:a=>a.projectRelationshipToSqlServer(c.source,c.author,c.binding,c.request)});}
 {const c=relationshipSqlServerCase(),trace:string[]=[];rows.push({id:'sqlserver.request-accessor',consumer:'SQL Server',trace,run:a=>a.projectRelationshipToSqlServer(c.source,c.author,c.binding,getter(c.request,'namespace',trace,'request') as any)});}
 for(const [name,caseName] of [['report.many-to-one','many-to-one'],['report.heterogeneous','heterogeneous']] as const){const c=relationshipAvroCase(caseName);rows.push({id:`parquet.${name}`,consumer:'Parquet',trace:[],run:a=>a.projectRelationshipToParquet(c.source,c.author,c.request)});}
 {const c=relationshipAvroCase(),trace:string[]=[];rows.push({id:'parquet.request-accessor',consumer:'Parquet',trace,run:a=>a.projectRelationshipToParquet(c.source,c.author,getter(c.request,'shape',trace,'request') as any)});}
 const extras=relationshipExtraCases(),good=extras.find(c=>c.expected==='projected'&&c.request.system==='graphql'&&c.request.mode==='report'),blocked=extras.find(c=>c.expected==='blocked'&&c.request.mode==='report');if(!good||!blocked)throw new Error('Frozen Extras fixtures unavailable');
 rows.push({id:'extras.report.graphql',consumer:'Extras',trace:[],run:a=>a.projectRelationshipToExtra(good.source,good.author,good.request)},{id:'extras.report.blocked',consumer:'Extras',trace:[],run:a=>a.projectRelationshipToExtra(blocked.source,blocked.author,blocked.request)});
 {const c=structuredClone(good),trace:string[]=[];rows.push({id:'extras.request-accessor',consumer:'Extras',trace,run:a=>a.projectRelationshipToExtra(c.source,c.author,getter(c.request,'records',trace,'request') as any)});}
 return rows;
}
async function capture(run:(api:any)=>unknown,api:any,trace:string[]){trace.length=0;try{return {outcome:{status:'returned',value:await run(api)},trace:[...trace]};}catch(error){return {outcome:errorShape(error),trace:[...trace]};}}
export async function replay(packet:any){
 const reference={projectRelationshipToAvro:refAvro,projectRelationshipToTableSpec:refTableSpec,projectRelationshipToSqlServer:refSqlServer,projectRelationshipToParquet:refParquet,projectRelationshipToExtra:refExtras};
 const cases=[];for(const row of makeCases()){
  const expected=packet.cases.find((x:any)=>x.id===row.id);if(!expected)throw new Error(`Missing frozen case ${row.id}`);
  const ref=await capture(row.run,reference,row.trace),actual=await capture(row.run,v4,row.trace);
  if(JSON.stringify(ref.outcome)!==JSON.stringify(expected.outcome)||JSON.stringify(ref.trace)!==JSON.stringify(expected.trace))throw new Error(`Browser reference drift at ${row.id}`);
  if(JSON.stringify(actual.outcome)!==JSON.stringify(expected.outcome)||JSON.stringify(actual.trace)!==JSON.stringify(expected.trace))throw new Error(`Browser V4 mismatch at ${row.id}: ${JSON.stringify(actual)}`);
  cases.push({id:row.id,consumer:row.consumer,status:actual.outcome.status,...(actual.outcome.status==='returned'?{projectionStatus:(actual.outcome as any).value.status}:{errorCode:(actual.outcome as any).code})});
 }
 return {cases,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis),userAgent:navigator.userAgent};
}
