/** Host-only qualification. Admission follows actual native observations, never retained source alone. */
import {createHash} from 'node:crypto';
import {mkdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {canonicalSchemaJson} from '../../src/model/schema-literals';
import {projectBit128Model} from '../../src/projections/bit128-model';
const base='fixtures/validation/uuid/',stages=['mixed','containers','associations','associations-polymorphic'],systems=['postgresql','sqlserver','avro','parquet','tablespec'];
const hash=async(path:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
const requireTrue=(value:unknown,message:string)=>{if(!value)throw Error(message);};
export function evaluateCompositionEvidence(e:any){
 requireTrue(e.artifacts.profile==='uuid-model2'&&e.artifacts.cases.length===20,'Complete composition artifact cohort required');
 for(const system of systems)for(const stage of stages){
  const cases=e.artifacts.cases.filter((r:any)=>r.system===system&&r.stage===stage);requireTrue(cases.length===1,'Missing or duplicate target/stage');const c=cases[0];
  requireTrue(canonicalSchemaJson(projectBit128Model(c.binding,c.logical,'report'))===canonicalSchemaJson(c.report),'Stale authored projection');
  const observations=(system==='postgresql'?e.pg:system==='sqlserver'?e.ms:system==='tablespec'?e.tablespec:e.files).observations.filter((r:any)=>r.system===system&&r.stage===stage);
  requireTrue(observations.length===1,'Missing native target/stage');const o=observations[0];
  if(['postgresql','sqlserver'].includes(system)){requireTrue(o.independentScalarAndUuidChecks&&o.negativeControls>=1&&o.rollback,'Missing database controls');requireTrue(stage==='mixed'||o.nestedExternalValueAcceptedAndCodecRefused,'Missing external nested-value counterexample');requireTrue(system==='postgresql'?/PostgreSQL 17\.9/.test(o.version):/^16\./.test(o.version),'Unexpected native database version');requireTrue(o.records.length===c.records.length,'Incomplete native SQL populations');}
  else requireTrue(o.independentScalarAndNestedUuidChecks&&o.records.length===c.records.length,'Missing independent native nested values');
  const recovered=e.recovery.cases.filter((r:any)=>r.system===system&&r.stage===stage);requireTrue(recovered.length===1&&recovered[0].authoredRecoveries===2&&recovered[0].nativeRecoveries===(['postgresql','sqlserver'].includes(system)?2:c.records.length*2),'Missing bidirectional adapter recovery');
 }
 requireTrue(e.pg.observations.length===4&&e.ms.observations.length===4&&e.files.observations.length===8&&e.tablespec.observations.length===4,'Unexpected native cohort size');
 requireTrue(e.files.versions.avro==='1.12.0'&&e.files.versions.fastavro==='1.12.2'&&e.files.versions.pyarrow==='21.0.0'&&e.tablespec.spark==='4.0.1','Unexpected file/Spark versions');
 requireTrue(e.browser.result.cases===20&&e.browser.result.rows===60&&e.browser.result.refusals===40&&e.browser.result.nodeGlobalsAbsent&&e.browser.externalRequests.length===0,'Missing real browser controls');
 requireTrue(e.returned.rows===72&&e.returned.refusals===24&&e.returned.nativeInvalidRefusals===16&&e.returned.allNativeReturnedDatasetsValidated,'Missing native returned-value validation');
 requireTrue(e.recovery.total===116,'Incomplete source/native recoveries');
 return {profile:'uuid-model2',fiveTargetCompositionDelivery:true,nativeEquivalence:false,consumerRuntimeAdoption:false,stages,systems,nativeReturnedRows:72,sourceRecoveries:116};
}
export async function verifyCompositionFingerprints(input:any){
 requireTrue(input?.fingerprints&&Object.keys(input.fingerprints).some(p=>p.startsWith('src/')),'Missing source-bound composition fingerprints');
 const proofNames=['composition-artifacts','composition-postgresql','composition-sqlserver','composition-files','composition-tablespec','composition-browser','composition-returned','composition-recovery'];
 for(const path of ['dist/umf.js',...proofNames.map(n=>base+n+'.json'),...['build','typecheck','schemas','tests','artifacts','postgresql','sqlserver','files','tablespec','recovery','returned','browser'].map(n=>base+'composition-runs/'+n+'.log'),'tests/helpers/uuid-composition-fixtures.ts','tests/uuid-mixed-model.test.ts','tests/uuid-composition-gates.test.ts'])requireTrue(typeof input.fingerprints[path]==='string','Missing composition proof: '+path);
 for(const pattern of ['src/**/*.ts','spec/**/*.json','scripts/uuid/*',base+'composition-files/**/*'])for await(const path of new Bun.Glob(pattern).scan('.'))requireTrue(typeof input.fingerprints[path]==='string','Missing source-bound path: '+path);
 for(const [path,expected] of Object.entries(input.fingerprints)){requireTrue(!path.startsWith('/')&&!path.split('/').includes('..')&&!path.includes('\\'),'Unsafe composition evidence path');requireTrue(await hash(path)===expected,'Stale composition evidence: '+path);}
}
export async function verifyCompositionQualification(){const q=await Bun.file(base+'composition-qualification.json').json();await verifyCompositionFingerprints(q);const e=await load();requireTrue(canonicalSchemaJson(evaluateCompositionEvidence(e))===canonicalSchemaJson(q.claim),'Changed composition claim');return q.claim;}
async function load(){const [artifacts,pg,ms,files,tablespec,browser,returned,recovery]=await Promise.all(['composition-artifacts','composition-postgresql','composition-sqlserver','composition-files','composition-tablespec','composition-browser','composition-returned','composition-recovery'].map(n=>Bun.file(base+n+'.json').json()));return {artifacts,pg,ms,files,tablespec,browser,returned,recovery};}
if(import.meta.main){
 if(process.argv.includes('--verify-only'))console.log(await verifyCompositionQualification());
 else{
  const e=await load(),claim=evaluateCompositionEvidence(e),inputHash=await hash(base+'composition-artifacts.json');
  for(const [path,expected] of Object.entries(e.tablespec.sources))requireTrue(await hash(path)===expected,'Changed TableSpec source');
  for(const o of [e.pg,e.ms,e.files,e.tablespec])requireTrue(o.inputSha256===inputHash,'Native input mismatch');
  for(const c of e.artifacts.cases.filter((c:any)=>['postgresql','sqlserver'].includes(c.system))){const o=(c.system==='postgresql'?e.pg:e.ms).observations.find((o:any)=>o.stage===c.stage);requireTrue(o.ddlSha256===createHash('sha256').update(c.report.candidate.text).digest('hex'),'Native DDL mismatch');}
  requireTrue(e.browser.bundleSha256===await hash('dist/umf.js'),'Stale browser bundle');
  const runDir=process.env.UMF_UUID_COMPOSITION_RUN_DIR;if(!runDir)throw Error('Actual qualification command run directory required');
  const exits=await Bun.file(join(runDir,'exits.json')).json(),steps=['build','typecheck','schemas','tests','artifacts','postgresql','sqlserver','files','tablespec','recovery','returned','browser'];
  const logs:string[]=[];await mkdir(base+'composition-runs',{recursive:true});
  for(const step of steps){requireTrue(exits[step]===0,'Missing/failed actual command '+step);const dest=base+'composition-runs/'+step+'.log';await copyFile(join(runDir,step+'.log'),dest);logs.push(dest);}
  const paths:string[]=['dist/umf.js','package.json','bun.lock','tsconfig.json','tsconfig.tools.json','scripts/build.ts','scripts/run-tests.ts','tests/helpers/uuid-model-fixtures.ts','tests/helpers/uuid-composition-fixtures.ts','tests/uuid-mixed-model.test.ts','tests/uuid-composition-gates.test.ts','native/sqlserver/catalog-v3.sql','native/postgresql/runtime.ts',...logs];
  for(const pattern of ['src/**/*.ts','spec/**/*.json','scripts/uuid/*',base+'composition-*.json',base+'composition-files/**/*'])for await(const path of new Bun.Glob(pattern).scan('.'))if(!path.endsWith('/composition-qualification.json'))paths.push(path);
  const fingerprints=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,await hash(p)])));
  const result={date:'2026-10-16',claim,commands:exits,fingerprints,limits:['Exact-text scalar fallback in file/model targets; float and temporal tokens retain lexical values without new arithmetic/validity semantics.','SQL JSON and TableSpec JSON text do not enforce nested domains or collection bounds; complete-value codecs required.','Native constraints do not establish lifecycle/ownership, inverse navigation or all distinct-endpoint participation bounds.','Finite acyclic shape definitions only; concurrent consumer execution, arbitrary native edits, physical cutover and native equivalence remain separately qualified.']};
  await verifyCompositionFingerprints(result);await Bun.write(base+'composition-qualification.json',JSON.stringify(result,null,2)+'\n');console.log(claim);
 }
}
