import {uuidModelQualificationTests} from './qualification-inventory';
/** Source-bound gate aggregation. Does not turn a bounded model profile into universal adapter support. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {projectBit128Model} from '../../src/projections/bit128-model';
import {uuidModel} from '../../tests/helpers/uuid-model-fixtures';
const sha=async(path:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
const read=(stem:string)=>Bun.file('fixtures/validation/uuid/'+stem+'.json').json();
const databases=await Promise.all(['postgresql','sqlserver'].map(async system=>{
 const evidence=await read(system+'-model');assert.match(evidence.version,system==='postgresql'?/^PostgreSQL 17\.9 /:/^16\./);assert.equal(evidence.cases.length,7);
 for(const c of evidence.cases){assert.equal(c.vectors,387);for(const flag of ['negativeControls','rollback','nullableRow','concurrentWriterBarrierObserved','readDuringUncommittedWriteMatchedCommittedRow','literalDefaultAndAllowedValues','nullableUniqueAndReverseKey','independentOracleFields'])assert.equal(c[flag],true);
  const {binding,logical}=uuidModel(c.kind,system,c.domain),r=projectBit128Model(binding,logical,'strict');assert.equal(r.status,'projected');assert.equal(createHash('sha256').update(r.candidate!.text).digest('hex'),c.ddlSha256);
 }
 const native=evidence.cases.find((c:any)=>c.kind==='native-uuid');assert.equal(native.classification.scalarType,'uuid');assert.equal(native.classification.basis,'native-type-identity');
 return {system,version:evidence.version,cases:evidence.cases.length,exactValueRecoveries:evidence.cases.reduce((n:number,c:any)=>n+c.decodedRows,0)};
}));
const coreBrowser=await read('model-core-browser');assert.equal(coreBrowser.bundleSha256,await sha('dist/umf.js'));assert.equal(coreBrowser.negativeRejected,true);assert.equal(coreBrowser.layerRejected,true);assert.equal(coreBrowser.result.codecChecks,2334);assert.equal(coreBrowser.result.keyChecks,389);
for(const [path,hash] of Object.entries(coreBrowser.sha256))assert.equal(await sha(path),hash);
const file=await read('file-model-native'),tablespec=await read('tablespec-model-native'),returned=await read('returned-verification'),browser=await read('model-browser');
assert.deepEqual({avro:file.versions.avro,fastavro:file.versions.fastavro,pyarrow:file.versions.pyarrow},{avro:'1.12.0',fastavro:'1.12.2',pyarrow:'21.0.0'});
assert.equal(file.inputSha256,await sha('fixtures/validation/uuid/file-model-artifacts.json'));
assert.equal(tablespec.inputSha256,file.inputSha256);assert.equal(file.observations.length,16);for(const observation of file.observations)assert.equal(observation.independentOracleFields,true);assert.equal(tablespec.observations.length,2);assert.equal(tablespec.spark,'4.0.1');assert.equal(returned.checks,9750);assert.equal(returned.refusals,4);for(const row of tablespec.observations){assert.equal(row.csvRequirednessNotEnforced,true);assert.equal(row.independentOracleFields,true);}
assert.equal(browser.bundleSha256,await sha('dist/umf.js'));assert.equal(browser.externalRequests.length,0);assert.equal(browser.result.models,18);assert.equal(browser.result.nodeGlobalsAbsent,true);
for(const [path,hash] of Object.entries(tablespec.sources))assert.equal(await sha(path),hash);
const runDir=process.env.UMF_UUID_QUALIFICATION_RUN_DIR??'/tmp',runLog=(name:string)=>runDir+'/'+name;
const commands={typecheck:runLog('uuid-model-typecheck.log'),build:runLog('uuid-model-build.log'),schemas:runLog('uuid-model-schemas.log'),tests:runLog('uuid-model-tests.log'),bindingRegression:runLog('uuid-model-binding-regression.log')};
// Exit records are written by the orchestrating command, never guessed from a quiet log.
const exits=await Bun.file(runLog('uuid-model-exits.json')).json();for(const name of ['build','typecheck','schemas','tests','bindingRegression','postgresql','sqlserver','artifacts','files','tablespec','nativeAdapters','returned','browser','coreBrowser'])assert.equal(exits[name],0,name+' did not pass');
const tests=await Bun.file(commands.tests).text();assert.match(tests,/0 fail/);
const completed=tests.split('\n').filter(line=>line.startsWith('{\"testProcess\":')).map(line=>JSON.parse(line)).filter(row=>Object.hasOwn(row,'exitCode'));
assert.deepEqual(completed.map(row=>row.testProcess).sort(),[...uuidModelQualificationTests].sort(),'Complete current UUID test inventory');for(const row of completed){assert.equal(row.exitCode,0);assert.equal(row.fail,0);assert.equal(row.completeSummary,true);assert.ok(row.pass>0);}

const regression=await Bun.file(commands.bindingRegression).text();assert.match(regression,/0 fail/);
const logPaths:string[]=[];
for(const [name,path] of Object.entries(commands)){const target='fixtures/validation/uuid/model-runs/'+name+'.log';await Bun.write(target,await Bun.file(path).arrayBuffer());logPaths.push(target);}
for(const [name,path] of Object.entries({postgresql:runLog('uuid-pg-model.log'),sqlserver:runLog('uuid-ms-model.log'),files:runLog('uuid-file-native.log'),tablespec:runLog('uuid-tablespec-model.log'),browser:runLog('uuid-model-browser.log'),returned:runLog('uuid-returned.log'),nativeAdapters:runLog('uuid-native-adapter-roundtrips.log'),coreBrowser:runLog('uuid-model-core-browser.log')})){const target='fixtures/validation/uuid/model-runs/'+name+'.log';await Bun.write(target,await Bun.file(path).arrayBuffer());logPaths.push(target);}
async function paths(pattern:string){const found:string[]=[];for await(const path of new Bun.Glob(pattern).scan('.'))found.push(path);return found;}
const sourcePaths=['package.json','bun.lock','tsconfig.json','tsconfig.tools.json','scripts/run-tests.ts','scripts/build.ts','scripts/uuid-browser.ts','native/postgresql/runtime.ts','native/sqlserver/catalog-v3.sql','tests/helpers/uuid-fixtures.ts','fixtures/validation/uuid/bit128-oracle.json',...await paths('src/**/*.ts'),...await paths('spec/**/*.json'),...await paths('scripts/uuid/*'),...await paths('fixtures/validation/uuid/model-files/*'),...await paths('tests/*uuid*.test.ts'),...await paths('tests/binding/*.test.ts'),'tests/bit128.test.ts','tests/uuid-model.test.ts','tests/uuid-file-model.test.ts','tests/helpers/uuid-model-fixtures.ts'];
const proofs=['postgresql-model','sqlserver-model','file-model-artifacts','file-model-native','file-model-returned','tablespec-model-native','tablespec-model-returned','returned-verification','model-browser','model-core-browser','native-adapter-roundtrips','sqlserver-model-catalogs'].map(s=>'fixtures/validation/uuid/'+s+'.json');
const fingerprints=Object.fromEntries(await Promise.all([...new Set([...sourcePaths,...proofs,...logPaths])].sort().map(async path=>[path,await sha(path)])));
const result={date:new Date().toISOString().slice(0,10),profile:'uuid-model1',boundedModelQualification:true,twoDatabaseValueAndNativeUuidClassificationGate:true,fiveTargetModelValueDeliveryGate:true,databases,fileCases:file.observations.length,fileChecks:file.observations.reduce((n:number,c:any)=>n+c.checks,0),sparkRows:780,returnedNativeRows:returned.checks,returnedNativeRefusals:returned.refusals,browser:browser.result,commands:exits,fingerprints,
 idealAdmitted:false,priorityDelivery:false,nativeEquivalence:false,consumerRuntimeAdoption:false,
 limits:['Qualified singular128-bit Record/carrier subset; mixed legacy scalar/container/group composition is not implied','Association and partition layouts beyond the declared foreign-key subset refuse','Native UUID and signed-pair indexes are not portable unsigned-byte order','Consumer deployment/cutover, wider drivers/isolation modes and native equivalence need separate qualification','This scoped UUID/native and legacy-binding replay is not a full repository replay']};
await Bun.write('fixtures/validation/uuid/model-qualification.json',JSON.stringify(result,null,2)+'\n');console.log({boundedModelQualification:true,idealAdmitted:false,priorityDelivery:false,limits:result.limits});
