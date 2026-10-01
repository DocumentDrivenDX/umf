import assert from 'node:assert/strict';
import corpus from '../../fixtures/relationship/authored/corpus.json';
import {relationshipRefreshCommands,relationshipProofs,relationshipSourceHashes,digest,readEvidence,safePath} from './relationship-gate-inputs';
import {relationshipTableSpecProjectionCases} from './relationship-tablespec-projection-cases';
import {relationshipAvroProjectionCases} from './relationship-avro-projection-cases';
import {relationshipParquetCases} from './relationship-parquet-cases';
import {relationshipSqlServerCases} from './relationship-sqlserver-cases';
import {postgresqlRelationshipCases} from './relationship-postgresql-cases';
import {relationshipExtraCases} from './relationship-extras-cases';
export type RelationshipEvidenceReader=(path:string)=>Promise<Uint8Array>;
export async function verifyRelationshipEvidence(read:RelationshipEvidenceReader=readEvidence){
 const json=async(p:string)=>JSON.parse(new TextDecoder().decode(await read(safePath(p))));
 const refresh=await json('fixtures/validation/relationship-gate-refresh.json');
 assert.equal(refresh.complete,true,'Incomplete relationship replay');assert.equal(refresh.nativeEquivalence,false);
 assert.deepEqual(refresh.sourceHashes,await relationshipSourceHashes(),'Stale relationship replay sources');
 assert.deepEqual(refresh.commands.map((c:any)=>c.command),relationshipRefreshCommands,'Missing required replay command');
 for(const row of refresh.commands){assert.equal(row.exitCode,0,'Failed replay command');assert.equal(digest(await read(safePath(row.log))),row.sha256,'Changed execution log');}
 assert.deepEqual(Object.keys(refresh.proofHashes).sort(),[...relationshipProofs].sort(),'Missing relationship proof');
 const proofs:Record<string,any>={};
 for(const path of relationshipProofs){assert.equal(digest(await read(path)),refresh.proofHashes[path],'Changed relationship proof '+path);const p=await json(path);proofs[path]=p;
  for(const [source,hash] of Object.entries(p.sha256??{}))assert.equal(digest(await read(safePath(source))),hash,'Stale native/browser proof '+source);
  if(path.includes('browser')){assert.match(p.browser,/^148\./,'Unqualified Chromium');assert.deepEqual(p.externalRequests,[]);const c=p.checks??p.result;assert(c.cases>0&&c.idealRecoveries>0,'Empty browser recovery matrix');assert(c.blocked>0,'Missing browser refusals');}
 }
 const get=(suffix:string)=>proofs['fixtures/validation/relationship-'+suffix];
 assert.equal(get('tablespec-projection-native.json').nativeVersion,'647e8e566ad78b864282ec65c0b0b2237aa63084');
 assert.deepEqual(get('tablespec-projection-native.json').versions,{pydantic:'2.11.10',jsonschema:'4.25.1'});
 assert.deepEqual(get('extras/native.json').versions,{graphqlCore:'3.2.12',rdflib:'7.6.0',linkmlRuntime:'1.11.0rc2'});
 assert.deepEqual(get('avro-projection-native.json').versions,{apache:'1.12.0',fastavro:'1.12.2'});
 assert.equal(get('parquet-native.json').version,'21.0.0');assert.equal(get('sqlserver-native.json').serverVersion,'16.0.4295.3');assert.equal(get('postgresql-native.json').serverVersion,170004);
 assert.deepEqual(get('extras/oracle.json').versions,{graphqlJs:'17.0.2',graphqlCore:'3.2.12',rdflib:'7.6.0',linkmlMetamodel:'1.11.0',linkmlRuntime:'1.11.0rc2'});
 const matrices={tablespec:relationshipTableSpecProjectionCases(),avro:relationshipAvroProjectionCases(),parquet:relationshipParquetCases(),sqlserver:relationshipSqlServerCases(),postgresql:postgresqlRelationshipCases(),extras:relationshipExtraCases()};
 const browserSuffix={tablespec:'tablespec-projection-browser.json',avro:'avro-projection-browser.json',parquet:'parquet-browser.json',sqlserver:'sqlserver-browser.json',postgresql:'postgresql-browser.json',extras:'extras/browser.json'};
 for(const [system,cases] of Object.entries(matrices)){
  const b=get(browserSuffix[system as keyof typeof browserSuffix]),checks=b.checks??b.result,projected=cases.filter(c=>c.expected==='projected').length;
  assert(projected>0);assert.equal(checks.cases,cases.length,'Incomplete browser matrix '+system);assert.equal(checks.blocked,cases.length-projected,'Incorrect refusal matrix '+system);assert.equal(checks.idealRecoveries,projected*2,'Incomplete ideal recoveries '+system);
 }
 const names=(rows:any[],key:string)=>[...new Set(rows.map(r=>r[key]))].sort();
 const expected=(system:keyof typeof matrices)=>matrices[system].filter(c=>c.expected==='projected').map(c=>'name'in c?c.name:c.id).sort();
 assert.deepEqual(names(get('tablespec-projection-native.json').rows,'case'),expected('tablespec'));assert(get('tablespec-projection-native.json').rows.every((r:any)=>r.runtimeAccepted&&r.checkedSchemaAccepted&&r.metadataPreserved&&r.columnPairs>0));
 assert.deepEqual(names(get('avro-projection-native.json').cases,'case'),expected('avro'));assert(get('avro-projection-native.json').cases.every((r:any)=>r.reads.apache&&r.reads.fastavro&&r.hex));
 assert.deepEqual(names(get('parquet-native.json').cases,'name'),expected('parquet'));assert(get('parquet-native.json').cases.every((r:any)=>r.rows>0&&r.graphEnforcement===false));
 assert.deepEqual(names(get('extras/native.json').cases,'name'),expected('extras'));assert(get('extras/native.json').cases.every((r:any)=>r.valid===true));
 assert.deepEqual(names(get('postgresql-native.json').rows.filter((r:any)=>r.status==='projected'),'id'),expected('postgresql'));
 const canonical=get('conformance-browser.json').checks,canonicalCount=corpus.cases.length+1;assert.equal(canonical.cases,canonicalCount);assert.equal(canonical.migrationRecoveries,canonicalCount*2);assert.equal(canonical.idealRecoveries,canonicalCount*6);assert.equal(canonical.nativeRecoveries,canonicalCount*12);assert.equal(canonical.strictBlocks,canonicalCount*3);assert.equal(canonical.refusals,canonicalCount*3);
 const sql=get('sqlserver-native.json'),pg=get('postgresql-native.json');assert.equal(sql.projected,expected('sqlserver').length);assert(sql.rows.length>0);assert(sql.rows.every((r:any)=>r.expected===r.actual.error),'SQL Server insertion mismatch');for(const name of expected('sqlserver')){const rows=sql.rows.filter((r:any)=>r.id.startsWith(name+'/'));assert(rows.some((r:any)=>r.actual.error===0)&&rows.some((r:any)=>r.actual.error===547),'Missing useful SQL Server mapping controls '+name);}assert(pg.rows.filter((r:any)=>r.status==='projected').length>0);
 assert(pg.rows.some((r:any)=>(r.probes??[]).some((p:any)=>JSON.stringify(p).includes('23503'))),'No PostgreSQL FK rejection control');
 assert(JSON.stringify(sql.rows).includes('547'),'No SQL Server FK rejection control');
 return {refreshSha256:digest(await read('fixtures/validation/relationship-gate-refresh.json')),usefulMappings:{postgresql:pg.rows.filter((r:any)=>r.status==='projected').reduce((n:number,r:any)=>n+r.mappings.length,0),sqlserver:sql.projected},versions:{postgresql:pg.serverVersion,sqlserver:sql.serverVersion,tablespec:get('tablespec-projection-native.json').nativeVersion,avro:get('avro-projection-native.json').versions,parquet:get('parquet-native.json').version,extras:get('extras/oracle.json').versions},proofHashes:refresh.proofHashes,sourceHashes:refresh.sourceHashes,browsers:Object.fromEntries(Object.entries(proofs).filter(([p])=>p.includes('browser')).map(([p,v])=>[p,v.checks??v.result])),usefulSystems:['postgresql','sqlserver']};
}
