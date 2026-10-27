// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the TypeScript behavior exposed by the six public relationship consumers.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {relationshipAvroCase} from '../../core-ideals/relationship-avro-projection-cases';
import {relationshipTableSpecCase} from '../../core-ideals/relationship-tablespec-projection-cases';
import {relationshipSqlServerCase} from '../../core-ideals/relationship-sqlserver-cases';
import {relationshipExtraCases} from '../../core-ideals/relationship-extras-cases';
import {postgresqlRelationshipCases} from '../../core-ideals/relationship-postgresql-cases';
import {projectRelationshipToAvro} from '../../../src/core-ideals/relationship-avro-projection';
import {projectRelationshipToTableSpec} from '../../../src/core-ideals/relationship-tablespec-projection';
import {projectRelationshipToSqlServer} from '../../../src/core-ideals/relationship-sqlserver-projection';
import {projectRelationshipToParquet} from '../../../src/core-ideals/relationship-parquet-projection';
import {projectRelationshipToExtra} from '../../../src/core-ideals/relationship-extras';
import {projectRelationshipsToPostgresql} from '../../../src/core-ideals/relationship-postgresql';
import {backend as postgresqlBackend} from '../../../native/postgresql/runtime';

const output='docs/helix/04-build/evidence/rust-migration/r8-relationship-consumer-predecessor/predecessor.json';
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const json=(value:unknown)=>JSON.stringify(value);
const sourceFiles=[
 'src/model/relationships.ts','src/model/json.ts','src/model/types.ts','src/generated/core-model.ts',
 'src/validation/document.ts','src/validation/relationships.ts','src/validation/schema.ts',
 'src/core-ideals/relationship-avro-projection.ts','src/core-ideals/relationship-tablespec-projection.ts',
 'src/core-ideals/relationship-sqlserver-projection.ts','src/core-ideals/relationship-parquet-projection.ts',
 'src/core-ideals/relationship-extras.ts','src/core-ideals/relationship-postgresql.ts','native/postgresql/runtime.ts',
 'scripts/core-relationship-cases.ts','scripts/core-relationship-operation-cases.ts',
 'scripts/core-ideals/relationship-avro-projection-cases.ts','scripts/core-ideals/relationship-tablespec-projection-cases.ts',
 'scripts/core-ideals/relationship-sqlserver-cases.ts','scripts/core-ideals/relationship-extras-cases.ts',
 'scripts/core-ideals/relationship-postgresql-cases.ts','scripts/relationship-postgresql-layout-cases.ts',
 'scripts/core-ideals/relationship-current-base.ts','fixtures/relationship/authored/corpus.json',
 'fixtures/projections/ddd-authored-relationships/base.json','fixtures/projections/ddd-authored-relationships/postgresql-layout-proposal.json',
 'docs/helix/02-design/contracts/CONTRACT-041-relationship.md',
];
const implementationFiles=[
 'src/core-ideals/relationship-avro-projection.ts','src/core-ideals/relationship-tablespec-projection.ts',
 'src/core-ideals/relationship-sqlserver-projection.ts','src/core-ideals/relationship-parquet-projection.ts',
 'src/core-ideals/relationship-extras.ts','src/core-ideals/relationship-postgresql.ts',
];
type Capture={id:string;consumer:string;caseHash:string;inputHash:string;outcomeHash:string;traceHash:string;outcome:unknown;trace:string[]};
const cases:Capture[]=[];
async function observe(id:string,consumer:string,input:unknown,run:()=>unknown|Promise<unknown>,trace:string[]=[]){
 let outcome:unknown;
 try{outcome={status:'returned',value:await run()};}
 catch(error){
  const e=error as {name?:unknown;code?:unknown;path?:unknown;pointer?:unknown;message?:unknown};
  outcome={status:'threw',name:String(e?.name??''),code:typeof e?.code==='string'?e.code:null,path:typeof e?.path==='string'?e.path:null,pointer:typeof e?.pointer==='string'?e.pointer:null,message:String(e?.message??'')};
 }
 const inputHash=hash(json(input)??'undefined'),outcomeHash=hash(json(outcome)??'undefined'),traceHash=hash(json(trace));
 const caseHash=hash(json({id,consumer,inputHash,outcomeHash,traceHash,outcome,trace}));
 cases.push({id,consumer,caseHash,inputHash,outcomeHash,traceHash,outcome,trace});
}
function withGetter<T extends object>(input:T,key:string,trace:string[],label:string):T{
 const copy=structuredClone(input);
 Object.defineProperty(copy,key,{enumerable:true,configurable:true,get(){trace.push(`${label}.${key}:get`);return null;}});
 return copy;
}

const avro=relationshipAvroCase();
await observe('avro.report.many-to-one','Avro',avro,()=>projectRelationshipToAvro(avro.source,avro.author,avro.request));
const avroBlocked=relationshipAvroCase('heterogeneous');
await observe('avro.report.heterogeneous','Avro',avroBlocked,()=>projectRelationshipToAvro(avroBlocked.source,avroBlocked.author,avroBlocked.request));
{
 const c=relationshipAvroCase(),trace:string[]=[];
 await observe('avro.request-accessor','Avro',{source:c.source,author:c.author,request:'shape getter'},()=>projectRelationshipToAvro(c.source,c.author,withGetter(c.request,'shape',trace,'request') as any),trace);
}

const table=relationshipTableSpecCase();
await observe('tablespec.report.many-to-one','TableSpec',table,()=>projectRelationshipToTableSpec(table.source,table.author,table.nativeSource,table.nativeTarget,table.request));
const tableBlocked=relationshipTableSpecCase('heterogeneous');
await observe('tablespec.report.heterogeneous','TableSpec',tableBlocked,()=>projectRelationshipToTableSpec(tableBlocked.source,tableBlocked.author,tableBlocked.nativeSource,tableBlocked.nativeTarget,tableBlocked.request));
{
 const c=relationshipTableSpecCase(),trace:string[]=[];
 await observe('tablespec.request-accessor','TableSpec',{source:c.source,author:c.author,nativeSource:c.nativeSource,nativeTarget:c.nativeTarget,request:'mode getter'},()=>projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,withGetter(c.request,'mode',trace,'request') as any),trace);
}

const sql=relationshipSqlServerCase();
await observe('sqlserver.report.many-to-one','SQL Server',sql,()=>projectRelationshipToSqlServer(sql.source,sql.author,sql.binding,sql.request));
const sqlBlocked=relationshipSqlServerCase('heterogeneous');
await observe('sqlserver.report.heterogeneous','SQL Server',sqlBlocked,()=>projectRelationshipToSqlServer(sqlBlocked.source,sqlBlocked.author,sqlBlocked.binding,sqlBlocked.request));
{
 const c=relationshipSqlServerCase(),trace:string[]=[];
 await observe('sqlserver.request-accessor','SQL Server',{source:c.source,author:c.author,binding:c.binding,request:'namespace getter'},()=>projectRelationshipToSqlServer(c.source,c.author,c.binding,withGetter(c.request,'namespace',trace,'request') as any),trace);
}

const parquet=relationshipAvroCase();
await observe('parquet.report.many-to-one','Parquet',parquet,()=>projectRelationshipToParquet(parquet.source,parquet.author,parquet.request));
const parquetBlocked=relationshipAvroCase('heterogeneous');
await observe('parquet.report.heterogeneous','Parquet',parquetBlocked,()=>projectRelationshipToParquet(parquetBlocked.source,parquetBlocked.author,parquetBlocked.request));
{
 const c=relationshipAvroCase(),trace:string[]=[];
 await observe('parquet.request-accessor','Parquet',{source:c.source,author:c.author,request:'shape getter'},()=>projectRelationshipToParquet(c.source,c.author,withGetter(c.request,'shape',trace,'request') as any),trace);
}

const extras=relationshipExtraCases();
const extraSuccess=extras.find(c=>c.expected==='projected'&&c.request.system==='graphql'&&c.request.mode==='report');
const extraBlocked=extras.find(c=>c.expected==='blocked'&&c.request.mode==='report');
if(!extraSuccess||!extraBlocked)throw new Error('Expected existing projected and blocked report cases for extras');
await observe('extras.report.graphql','Extras',extraSuccess,()=>projectRelationshipToExtra(extraSuccess.source,extraSuccess.author,extraSuccess.request));
await observe('extras.report.blocked','Extras',extraBlocked,()=>projectRelationshipToExtra(extraBlocked.source,extraBlocked.author,extraBlocked.request));
{
 const c=structuredClone(extraSuccess),trace:string[]=[];
 await observe('extras.request-accessor','Extras',{source:c.source,author:c.author,request:'records getter'},()=>projectRelationshipToExtra(c.source,c.author,withGetter(c.request,'records',trace,'request') as any),trace);
}

const postgres=postgresqlRelationshipCases();
const postgresSuccess=postgres.find(c=>c.id==='keyed-association-and-fk');
const postgresBlocked=postgres.find(c=>c.id==='edge');
if(!postgresSuccess||!postgresBlocked)throw new Error('Expected existing keyed-association and edge PostgreSQL cases');
await observe('postgresql.report.keyed-association-and-fk','PostgreSQL',postgresSuccess,()=>projectRelationshipsToPostgresql(postgresSuccess.source,postgresSuccess.binding,postgresSuccess.authors,postgresSuccess.request,postgresqlBackend));
await observe('postgresql.report.edge','PostgreSQL',postgresBlocked,()=>projectRelationshipsToPostgresql(postgresBlocked.source,postgresBlocked.binding,postgresBlocked.authors,postgresBlocked.request,postgresqlBackend));
{
 const c=postgresqlRelationshipCases().find(x=>x.id==='keyed-association-and-fk')!,trace:string[]=[];
 await observe('postgresql.request-accessor','PostgreSQL',{source:c.source,binding:c.binding,authors:c.authors,request:'mode getter'},()=>projectRelationshipsToPostgresql(c.source,c.binding,c.authors,withGetter(c.request,'mode',trace,'request') as any,postgresqlBackend),trace);
}

const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async path=>[path,hash(await readFile(path))])));
const packet={
 format:'umf-r8-relationship-consumer-typescript-predecessor/1',runtime:{bun:Bun.version,postgresqlBackend:postgresqlBackend.identity},
 sourceHashes,captureScriptSha256:hash(await readFile('scripts/rust-migration/r8/relationship-consumer-predecessor.ts')),
 consumers:implementationFiles.map(path=>({path,sha256:sourceHashes[path]})),caseCount:cases.length,
 coverage:{consumers:['Avro','TableSpec','SQL Server','Parquet','Extras (GraphQL subset)','PostgreSQL'],
 casesPerConsumer:3,limits:['Representative report success, report-level blocked/refusal, and one request-accessor control per consumer; this is not each consumer’s full matrix.',
 'Avro and Parquet use the same existing authored relationship case factory with their separate consumer functions.',
 'Extras is limited to one GraphQL report success and one existing report-blocked case; RDF and LinkML are not independently covered.',
 'PostgreSQL uses the existing native AST backend and two selected generated cases; the broader ten-case matrix and all native counterexamples are not covered.',
 'No Rust route, installed package, browser, native adapter equivalence, or retirement claim is included.']},cases};
const body=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')){
 const existing=await readFile(output,'utf8');if(existing!==body)throw new Error(`Frozen predecessor differs: ${output}`);
}else await writeFile(output,body);
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',caseCount:cases.length,sha256:hash(body)}));
