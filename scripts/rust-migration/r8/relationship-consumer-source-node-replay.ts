// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare source V4 Node consumer routes with frozen TypeScript reference outcomes.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {relationshipAvroCase} from '../../core-ideals/relationship-avro-projection-cases';
import {relationshipTableSpecCase} from '../../core-ideals/relationship-tablespec-projection-cases';
import {relationshipSqlServerCase} from '../../core-ideals/relationship-sqlserver-cases';
import {relationshipExtraCases} from '../../core-ideals/relationship-extras-cases';
import {postgresqlRelationshipCases} from '../../core-ideals/relationship-postgresql-cases';
import {projectRelationshipToAvro as refAvro} from '../../../src/core-ideals/relationship-avro-projection';
import {projectRelationshipToTableSpec as refTableSpec} from '../../../src/core-ideals/relationship-tablespec-projection';
import {projectRelationshipToSqlServer as refSqlServer} from '../../../src/core-ideals/relationship-sqlserver-projection';
import {projectRelationshipToParquet as refParquet} from '../../../src/core-ideals/relationship-parquet-projection';
import {projectRelationshipToExtra as refExtras} from '../../../src/core-ideals/relationship-extras';
import {projectRelationshipsToPostgresql as refPostgresql} from '../../../src/core-ideals/relationship-postgresql';
import {backend as postgresqlBackend} from '../../../native/postgresql/runtime';

const root=process.cwd();
const frozenPath='docs/helix/04-build/evidence/rust-migration/r8-relationship-consumer-predecessor/predecessor.json';
const frozenBytes=await readFile(frozenPath),frozen=JSON.parse(frozenBytes.toString());
const routePath=process.env.UMF_R8_RELATIONSHIP_NODE_ROOT;
console.log('loading source V4 Node root');const v4=routePath?await import(pathToFileURL(routePath).href):await import('../../../src/index-node-v4');console.log('source V4 Node root loaded');
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const shape=(error:unknown)=>{const e=error as {name?:unknown;code?:unknown;path?:unknown;pointer?:unknown;message?:unknown};return {status:'threw',name:String(e?.name??''),code:typeof e?.code==='string'?e.code:null,path:typeof e?.path==='string'?e.path:null,pointer:typeof e?.pointer==='string'?e.pointer:null,message:String(e?.message??'')};};
type RunCase={id:string;consumer:string;input:unknown;run:(api:any)=>unknown|Promise<unknown>};
function getter<T extends object>(input:T,key:string,trace:string[],label:string):T{const copy=structuredClone(input);Object.defineProperty(copy,key,{enumerable:true,configurable:true,get(){trace.push(`${label}.${key}:get`);return null;}});return copy;}
function makeCases():RunCase[]{
 const rows:RunCase[]=[];
 for(const [name,caseName] of [['report.many-to-one','many-to-one'],['report.heterogeneous','heterogeneous']] as const){const c=relationshipAvroCase(caseName);rows.push({id:`avro.${name}`,consumer:'Avro',input:c,run:a=>a.projectRelationshipToAvro(c.source,c.author,c.request)});}
 {const c=relationshipAvroCase(),trace:string[]=[];rows.push({id:'avro.request-accessor',consumer:'Avro',input:{source:c.source,author:c.author,request:'shape getter'},run:a=>a.projectRelationshipToAvro(c.source,c.author,getter(c.request,'shape',trace,'request') as any)});(rows.at(-1) as any).trace=trace;}
 for(const [name,caseName] of [['report.many-to-one','many-to-one'],['report.heterogeneous','heterogeneous']] as const){const c=relationshipTableSpecCase(caseName);rows.push({id:`tablespec.${name}`,consumer:'TableSpec',input:c,run:a=>a.projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,c.request)});}
 {const c=relationshipTableSpecCase(),trace:string[]=[];rows.push({id:'tablespec.request-accessor',consumer:'TableSpec',input:{source:c.source,author:c.author,nativeSource:c.nativeSource,nativeTarget:c.nativeTarget,request:'mode getter'},run:a=>a.projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,getter(c.request,'mode',trace,'request') as any)});(rows.at(-1) as any).trace=trace;}
 for(const [name,caseName] of [['report.many-to-one','many-to-one'],['report.heterogeneous','heterogeneous']] as const){const c=relationshipSqlServerCase(caseName);rows.push({id:`sqlserver.${name}`,consumer:'SQL Server',input:c,run:a=>a.projectRelationshipToSqlServer(c.source,c.author,c.binding,c.request)});}
 {const c=relationshipSqlServerCase(),trace:string[]=[];rows.push({id:'sqlserver.request-accessor',consumer:'SQL Server',input:{source:c.source,author:c.author,binding:c.binding,request:'namespace getter'},run:a=>a.projectRelationshipToSqlServer(c.source,c.author,c.binding,getter(c.request,'namespace',trace,'request') as any)});(rows.at(-1) as any).trace=trace;}
 for(const [name,caseName] of [['report.many-to-one','many-to-one'],['report.heterogeneous','heterogeneous']] as const){const c=relationshipAvroCase(caseName);rows.push({id:`parquet.${name}`,consumer:'Parquet',input:c,run:a=>a.projectRelationshipToParquet(c.source,c.author,c.request)});}
 {const c=relationshipAvroCase(),trace:string[]=[];rows.push({id:'parquet.request-accessor',consumer:'Parquet',input:{source:c.source,author:c.author,request:'shape getter'},run:a=>a.projectRelationshipToParquet(c.source,c.author,getter(c.request,'shape',trace,'request') as any)});(rows.at(-1) as any).trace=trace;}
 const extras=relationshipExtraCases(),good=extras.find(c=>c.expected==='projected'&&c.request.system==='graphql'&&c.request.mode==='report'),blocked=extras.find(c=>c.expected==='blocked'&&c.request.mode==='report');if(!good||!blocked)throw new Error('Frozen Extras fixtures unavailable');
 rows.push({id:'extras.report.graphql',consumer:'Extras',input:good,run:a=>a.projectRelationshipToExtra(good.source,good.author,good.request)},{id:'extras.report.blocked',consumer:'Extras',input:blocked,run:a=>a.projectRelationshipToExtra(blocked.source,blocked.author,blocked.request)});
 {const c=structuredClone(good),trace:string[]=[];rows.push({id:'extras.request-accessor',consumer:'Extras',input:{source:c.source,author:c.author,request:'records getter'},run:a=>a.projectRelationshipToExtra(c.source,c.author,getter(c.request,'records',trace,'request') as any)});(rows.at(-1) as any).trace=trace;}
 const pg=postgresqlRelationshipCases(),pgGood=pg.find(c=>c.id==='keyed-association-and-fk'),pgBlocked=pg.find(c=>c.id==='edge');if(!pgGood||!pgBlocked)throw new Error('Frozen PostgreSQL fixtures unavailable');
 rows.push({id:'postgresql.report.keyed-association-and-fk',consumer:'PostgreSQL',input:pgGood,run:a=>a.projectRelationshipsToPostgresql(pgGood.source,pgGood.binding,pgGood.authors,pgGood.request,postgresqlBackend)},{id:'postgresql.report.edge',consumer:'PostgreSQL',input:pgBlocked,run:a=>a.projectRelationshipsToPostgresql(pgBlocked.source,pgBlocked.binding,pgBlocked.authors,pgBlocked.request,postgresqlBackend)});
 {const c=postgresqlRelationshipCases().find(x=>x.id==='keyed-association-and-fk')!,trace:string[]=[];rows.push({id:'postgresql.request-accessor',consumer:'PostgreSQL',input:{source:c.source,binding:c.binding,authors:c.authors,request:'mode getter'},run:a=>a.projectRelationshipsToPostgresql(c.source,c.binding,c.authors,getter(c.request,'mode',trace,'request') as any,postgresqlBackend)});(rows.at(-1) as any).trace=trace;}
 return rows;
}
const ref={projectRelationshipToAvro:refAvro,projectRelationshipToTableSpec:refTableSpec,projectRelationshipToSqlServer:refSqlServer,projectRelationshipToParquet:refParquet,projectRelationshipToExtra:refExtras,projectRelationshipsToPostgresql:refPostgresql};
async function capture(c:RunCase,api:any){const trace=(c as any).trace as string[]|undefined;if(trace)trace.length=0;try{return {outcome:{status:'returned',value:await c.run(api)},trace:trace?[...trace]:[]};}catch(error){return {outcome:shape(error),trace:trace?[...trace]:[]};}}
const cases=[];
for(const c of makeCases()){
 console.log(`replay ${c.id}`);const expected=frozen.cases.find((x:any)=>x.id===c.id);if(!expected)throw new Error(`No frozen case ${c.id}`);
 const reference=await capture(c,ref);
 const actual=await capture(c,v4);
 if(JSON.stringify(reference.outcome)!==JSON.stringify(expected.outcome)||JSON.stringify(reference.trace)!==JSON.stringify(expected.trace))throw new Error(`Reference capture drift at ${c.id}`);
 if(JSON.stringify(actual.outcome)!==JSON.stringify(expected.outcome)||JSON.stringify(actual.trace)!==JSON.stringify(expected.trace))throw new Error(`V4 source route differs from frozen outcome at ${c.id}: ${JSON.stringify({actual,expected:{outcome:expected.outcome,trace:expected.trace}})}`);
 cases.push({id:c.id,consumer:c.consumer,status:actual.outcome.status,...(actual.outcome.status==='returned'?{projectionStatus:(actual.outcome as any).value.status}: {errorCode:(actual.outcome as any).code}),inputHash:expected.inputHash,outcomeHash:expected.outcomeHash,traceHash:expected.traceHash});
}
if(cases.length!==18)throw new Error(`Expected frozen 18-case cohort, got ${cases.length}`);
const caseInputPaths=['scripts/core-relationship-cases.ts','scripts/core-relationship-operation-cases.ts','scripts/core-ideals/relationship-avro-projection-cases.ts','scripts/core-ideals/relationship-tablespec-projection-cases.ts','scripts/core-ideals/relationship-sqlserver-cases.ts','scripts/core-ideals/relationship-extras-cases.ts','scripts/core-ideals/relationship-postgresql-cases.ts','scripts/relationship-postgresql-layout-cases.ts','scripts/core-ideals/relationship-current-base.ts','fixtures/relationship/authored/corpus.json','fixtures/projections/ddd-authored-relationships/base.json','fixtures/projections/ddd-authored-relationships/postgresql-layout-proposal.json'];
const sourcePaths=[...new Set(['scripts/rust-migration/r8/relationship-consumer-source-node-replay.ts','scripts/rust-migration/r8/relationship-consumer-predecessor.ts','src/index-node-v4.ts','src/index-browser-v4.ts','src/core-ideals/relationship-avro-projection-factory.ts','src/core-ideals/relationship-tablespec-projection-factory.ts','src/core-ideals/relationship-sqlserver-projection-factory.ts','src/core-ideals/relationship-parquet-projection-factory.ts','src/core-ideals/relationship-extras-factory.ts','src/core-ideals/relationship-postgresql-factory.ts','src/core-ideals/relationship-avro-projection.ts','src/core-ideals/relationship-tablespec-projection.ts','src/core-ideals/relationship-sqlserver-projection.ts','src/core-ideals/relationship-parquet-projection.ts','src/core-ideals/relationship-extras.ts','src/core-ideals/relationship-postgresql.ts','src/access/rust-relationships-default.ts','src/model/relationships.ts','crates/umf-core/src/core_relationships.rs','crates/umf-core-wire/src/lib.rs','bindings/core/node/src/core-relationships.js','bindings/core/wasm/src/core-relationships.js','native/postgresql/runtime.ts',...caseInputPaths])];
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(path))])));
for(const path of caseInputPaths)if(frozen.sourceHashes[path]!==sourceHashes[path])throw new Error(`Frozen case input changed: ${path}`);
const artifacts={nodeBindingEntrySha256:hash(await readFile('bindings/core/node/index.js')),nodeAddonSha256:hash(await readFile('bindings/core/node/umf_core_node.node'))};
const receipt={format:'umf-r8-relationship-consumer-source-node-replay/1',status:'pass',runtime:{bun:Bun.version,node:process.version,platform:process.platform,arch:process.arch},route:{entry:routePath??'src/index-node-v4.ts',host:'source V4 Node root'},reference:{root:'direct TypeScript consumer modules'},predecessor:{path:frozenPath,sha256:hash(frozenBytes),caseCount:frozen.caseCount},caseInputsPinned:true,comparison:{caseCount:cases.length,projected:cases.filter(c=>'projectionStatus' in c&&c.projectionStatus==='projected').length,blocked:cases.filter(c=>'projectionStatus' in c&&c.projectionStatus==='blocked').length,accessorRefusals:cases.filter(c=>'errorCode' in c&&c.errorCode==='NON_JSON').length,exactReceiptEquality:true,errorShapeEquality:true},sourceHashes,artifacts,cases,qualification:'Current source V4 Node root versus direct TypeScript reference consumers for the frozen predecessor 18-case subset. No installed archive, browser qualification, full consumer matrix, or release claim.'};
const out=process.env.UMF_R8_RELATIONSHIP_NODE_RECEIPT??'docs/helix/04-build/evidence/rust-migration/r8-relationship-consumer-source-replay/node.json';await writeFile(out,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
