// SPDX-License-Identifier: MIT OR Apache-2.0
/** Reviewed gate for a source-bound Rust/Ajv comparison report. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export type GateResult = {accepted:boolean; failures:string[]; exclusions:number};
export type ExpectedCase = {file:string; index:number; expected:boolean[]};
const corpusRoot='fixtures/json-schema/upstream';
const revision='ab079cc2bace029fdbb483be28a6ade526bcfbc2';

export function requiredSourceClosurePaths():string[] {
  const coreInputs=[...new Bun.Glob('crates/umf-core/src/**/*').scanSync('.')];
  const vendorInputs=[...new Bun.Glob('crates/umf-core/vendor/saphyr-parser/**/*').scanSync('.')];
  return [...new Set(['Cargo.toml','Cargo.lock','crates/umf-core/Cargo.toml','crates/umf-core/vendor/saphyr-parser/Cargo.toml','fixtures/json-schema/upstream/manifest.json','crates/umf-core/tests/r5_json_schema_full_corpus.rs','scripts/rust-migration/r5/json-schema/upstream-oracle.ts','docs/helix/04-build/evidence/rust-migration/r5-json-schema/upstream-oracle-harness.md',...coreInputs,...vendorInputs])].sort();
}

export function validateManifestPathClosure(manifestPaths:string[], actualPaths:string[]):void {
  const listed=[...manifestPaths].sort(),actual=[...actualPaths].filter(p=>p!=='manifest.json').sort();
  if(new Set(listed).size!==listed.length || JSON.stringify(listed)!==JSON.stringify(actual)) throw new Error('Corpus manifest checksum path set does not match the complete corpus tree');
}

export async function loadExpectedCases():Promise<ExpectedCase[]> {
  const manifest=JSON.parse(await readFile(join(corpusRoot,'manifest.json'),'utf8'));
  if(manifest.revision!==revision || manifest.dialect!=='2020-12' || manifest.rootFiles!==46 || manifest.rootCases!==384 || manifest.rootVectors!==1301) throw new Error('Pinned corpus manifest identity/count mismatch');
  const actualCorpusPaths=[...new Bun.Glob('**/*').scanSync(corpusRoot)].sort();
  validateManifestPathClosure(Object.keys(manifest.sha256),actualCorpusPaths);
  for(const [relative,expected] of Object.entries<string>(manifest.sha256)) {
    const actual=createHash('sha256').update(await readFile(join(corpusRoot,relative))).digest('hex');
    if(actual!==expected) throw new Error(`Pinned corpus digest mismatch: ${relative}`);
  }
  const files=[...new Bun.Glob('*.json').scanSync(join(corpusRoot,'draft2020-12'))].sort();
  const result:ExpectedCase[]=[];
  for(const file of files) {
    const cases=JSON.parse(await readFile(join(corpusRoot,'draft2020-12',file),'utf8'));
    cases.forEach((item:any,index:number)=>result.push({file,index,expected:item.tests.map((v:any)=>v.valid)}));
  }
  if(files.length!==46 || result.length!==384 || result.reduce((n,c)=>n+c.expected.length,0)!==1301) throw new Error('Pinned corpus file/case/vector closure mismatch');
  return result;
}

export function assess(report:any, raw:any, exclusions:any, expectedCases:ExpectedCase[], requiredClosurePaths:string[]):GateResult {
  const failures:string[]=[]; const fail=(message:string)=>failures.push(message);
  const expectedByKey=new Map(expectedCases.map(c=>[`${c.file}:${c.index}`,c]));
  const totalVectors=expectedCases.reduce((n,c)=>n+c.expected.length,0);
  const expectedFiles=new Set(expectedCases.map(c=>c.file));
  if(report?.rustCapture?.status!=='passed') fail('Rust capture status is not passed');
  if(expectedByKey.size!==expectedCases.length) fail('Expected corpus contains duplicate case keys');
  if(report?.sourceRevision!==revision || report?.dialect!=='2020-12') fail('Pinned report corpus identity mismatch');
  if(report?.files!==expectedFiles.size || report?.cases!==expectedCases.length || report?.vectors!==totalVectors) fail('Pinned report corpus totals mismatch');
  if(raw?.sourceRevision!==revision || raw?.dialect!=='2020-12' || raw?.files!==expectedFiles.size || raw?.cases!==expectedCases.length || raw?.vectors!==totalVectors) fail('Raw Rust capture identity/count mismatch');
  const closure=report?.sourceClosure;
  const closureKeys=closure?.sha256&&typeof closure.sha256==='object'?Object.keys(closure.sha256).sort():[];
  if(closure?.status!=='pre-post-identical-during-capture' || !closure.sha256 || typeof closure.sha256!=='object' || closureKeys.length!==closure.fileCount || !Number.isInteger(closure.fileCount) || Object.values(closure.sha256).some((v:any)=>typeof v!=='string'||! /^[0-9a-f]{64}$/.test(v))) fail('Source closure evidence is missing or malformed');
  if(JSON.stringify(closureKeys)!==JSON.stringify([...requiredClosurePaths].sort())) fail('Source closure path set does not match the runner capture inventory');
  if(report?.rustCapture?.rawReportSha256!==raw?.__sha256) fail('Raw capture SHA-256 does not link to comparison report');
  if(typeof report?.rustCapture?.rawReport!=='string' || !report.rustCapture.rawReport.trim() || !/^[0-9a-f]{64}$/.test(report?.rustCapture?.rawReportSha256??'')) fail('Recorded raw capture provenance path/hash is missing');
  if(report?.missingRustCases!==0 || !Array.isArray(report?.records) || report.records.length!==expectedCases.length) fail('Rust case records are incomplete');
  if(!Array.isArray(raw?.records) || raw.records.length!==expectedCases.length) fail('Raw Rust case records are incomplete');
  if(exclusions?.schema!=='umf-r5-json-schema-exclusions/v1' || !Array.isArray(exclusions.items)) fail('Reviewed exclusion catalog is missing or malformed');

  const allowed=new Map<string,{kind:string;reason:string}>();
  if(Array.isArray(exclusions?.items)) for(const item of exclusions.items) {
    if(typeof item.case!=='string'||typeof item.reason!=='string'||!item.reason.trim()||!['ajv-defect','unsupported'].includes(item.kind)||allowed.has(item.case)) fail('Exclusion catalog contains malformed or duplicate entries');
    else allowed.set(item.case,{kind:item.kind,reason:item.reason});
  }
  const comparisonByKey=new Map<string,any>(),rawByKey=new Map<string,any>();
  for(const [rows,map,label] of [[report?.records,comparisonByKey,'comparison'],[raw?.records,rawByKey,'raw']] as const) {
    for(const row of Array.isArray(rows)?rows:[]) {
      const key=`${row?.file}:${row?.index}`;
      if(!expectedByKey.has(key)||map.has(key)) fail(`Unknown or duplicate ${label} case ${key}`);
      else map.set(key,row);
    }
  }
  let rustExecuted=0,rustNotCompiled=0,rustErrors=0,rustExpectedDiff=0,rustAjvCompared=0,rustAjvDiff=0;
  let ajvBaselineMismatches=0,ajvBaselineErrors=0,ajvExportedErrors=0,ajvVectorErrors=0;
  const ajvCompileFailureCases=new Set<string>(),ajvNativeCompileFailureCases=new Set<string>();
  let exportedCompared=0,exportedUnavailable=0,exportedParityMismatch=0,exportedExpectedMismatch=0,exportedCasesUnavailable=0;
  let vectorsTotal=0,adapterFailures=0,compileFailures=0;
  for(const [key,expected] of expectedByKey) {
    const row=comparisonByKey.get(key),rawRow=rawByKey.get(key);
    if(!row||!rawRow) {fail(`Missing per-case record ${key}`);continue;}
    const rawVectors=rawRow.vectors, outcomes=row.vectorOutcomes;
    if(!Array.isArray(rawVectors)||rawVectors.length!==expected.expected.length||rawRow.vectorCount!==expected.expected.length) fail(`Raw vector cardinality mismatch for ${key}`);
    if(!Array.isArray(outcomes)||outcomes.length!==expected.expected.length||row.vectors!==expected.expected.length) {fail(`Comparison vector cardinality mismatch for ${key}`);continue;}
    vectorsTotal+=outcomes.length;
    const rawAdapter=rawRow.adapter?.Ok;
    const adapterStable=!!rawAdapter && rawAdapter.rootExact===true && rawAdapter.resourcesExact===true && rawAdapter.getRoot===rawAdapter.originalRoot;
    if(row.adapterStable!==adapterStable) fail(`Comparison preservation result does not match raw adapter evidence for ${key}`);
    if(!adapterStable) adapterFailures++;
    if(rawRow.compileError) compileFailures++;
    let caseExportComparable=false;
    for(let i=0;i<expected.expected.length;i++) {
      const outcome=outcomes[i],rawVector=rawVectors[i];
      if(outcome?.index!==i||outcome.expected!==expected.expected[i]||rawVector?.index!==i||rawVector.expected!==expected.expected[i]) {fail(`Vector identity/expectation mismatch for ${key}#${i}`);continue;}
      const rust=rawVector.rust, rustState=outcome.rust;
      if(rust?.Ok!==undefined) {
        const valid=rust.Ok;
        if(typeof valid!=='boolean'||rustState?.status!=='result'||rustState.valid!==valid) fail(`Rust result does not match raw capture for ${key}#${i}`);
        rustExecuted++;
        if(valid!==expected.expected[i]) rustExpectedDiff++;
      } else if(rust?.Err!==undefined) {
        if(rustState?.status!=='error'||rustState.error!==rust.Err) fail(`Rust error does not match raw capture for ${key}#${i}`);
        rustErrors++;
      } else {
        if(rustState?.status!=='not-compiled') fail(`Missing Rust vector is not marked not-compiled for ${key}#${i}`);
        rustNotCompiled++;
      }
      if(rawRow.compileError && (rust?.Ok!==undefined||rust?.Err!==undefined||rustState?.status!=='not-compiled')) fail(`Raw compile refusal conflicts with vector outcome at ${key}#${i}`);
      if(!rawRow.compileError && rustState?.status==='not-compiled') fail(`Vector marked uncompiled without raw compile refusal at ${key}#${i}`);
      const ajv=outcome.ajv;
      if(ajv?.status==='result') {
        if(typeof ajv.valid!=='boolean') fail(`Invalid Ajv result for ${key}#${i}`);
        else {
          if(ajv.valid!==expected.expected[i]) {
            ajvBaselineMismatches++;
            if(allowed.get(key)?.kind!=='ajv-defect') fail(`Unclassified Ajv/upstream discrepancy ${key}#${i}`);
            if(rust?.Ok!==expected.expected[i]) fail(`Ajv discrepancy is not corrected by Rust at ${key}#${i}`);
          }
          if(rust?.Ok!==undefined) {rustAjvCompared++;if(rust.Ok!==ajv.valid) {rustAjvDiff++;if(rust.Ok!==expected.expected[i]||allowed.get(key)?.kind!=='ajv-defect') fail(`Unclassified Rust/Ajv discrepancy ${key}#${i}`);}}
        }
      } else if(ajv?.status==='error'||ajv?.status==='compile-error') {
        if(ajv.status==='error') {ajvBaselineErrors++;ajvVectorErrors++;} else ajvCompileFailureCases.add(key);
        if(allowed.get(key)?.kind!=='unsupported') fail(`Unclassified Ajv unavailable case ${key}#${i}`);
      } else fail(`Missing Ajv outcome for ${key}#${i}`);
      const exported=outcome.exported;
      if(exported?.status==='result') {
        if(typeof exported.valid!=='boolean') fail(`Invalid exported-schema result for ${key}#${i}`);
        else {
          exportedCompared++;caseExportComparable=true;
          if(ajv?.status!=='result') fail(`Exported result has no original Ajv result for ${key}#${i}`);
          else if(exported.valid!==ajv.valid) {exportedParityMismatch++;fail(`Original/exported semantic mismatch ${key}#${i}`);}
          if(exported.valid!==expected.expected[i]) exportedExpectedMismatch++;
        }
      } else if(exported?.status==='compile-error'||exported?.status==='error'||exported?.status==='not-compared') {
        exportedUnavailable++;
        if(exported.status==='compile-error') ajvNativeCompileFailureCases.add(key);
        if(exported.status==='error') {ajvExportedErrors++;ajvVectorErrors++;}
        if(allowed.get(key)?.kind!=='unsupported') fail(`Unclassified exported-schema unavailability ${key}#${i}`);
      } else fail(`Missing exported-schema outcome for ${key}#${i}`);
    }
    if(!caseExportComparable) exportedCasesUnavailable++;
    if(allowed.has(key)) {
      const item=allowed.get(key)!;
      const observedAjvUnavailable=outcomes.some((v:any)=>v.ajv?.status==='error'||v.ajv?.status==='compile-error'||v.exported?.status==='compile-error'||v.exported?.status==='error'||v.exported?.status==='not-compared');
      const observedAjvMismatch=outcomes.some((v:any)=>v.ajv?.status==='result'&&v.ajv.valid!==v.expected);
      if(item.kind==='unsupported'&&!observedAjvUnavailable) fail(`Unsupported exclusion has no observed unavailable vector: ${key}`);
      if(item.kind==='ajv-defect'&&!observedAjvMismatch) fail(`Ajv-defect exclusion has no observed baseline disagreement: ${key}`);
    }
  }
  for(const key of allowed.keys()) if(!expectedByKey.has(key)) fail(`Exclusion references absent case ${key}`);
  if(vectorsTotal!==totalVectors) fail('Per-vector accounting does not close');
  if(report?.rustVectorsExecuted!==rustExecuted||report?.rustVectorsNotCompiled!==rustNotCompiled||report?.rustVectorErrors!==rustErrors||report?.rustExpectedComparisons!==rustExecuted||report?.rustExpectedDisagreements!==rustExpectedDiff) fail('Rust aggregate counters do not reconcile with vector outcomes');
  if(rustExpectedDiff!==0) fail('Rust semantic disagreements with upstream remain');
  if(compileFailures!==0) fail('Rust schema compile/refusals remain');
  if(rustExecuted+rustNotCompiled+rustErrors!==totalVectors||rustExecuted!==totalVectors||rustNotCompiled!==0||rustErrors!==0) fail('Rust execution is incomplete or contains errors');
  if(report?.rustAjvComparisons!==rustAjvCompared||report?.rustAjvDisagreements!==rustAjvDiff) fail('Rust/Ajv aggregate counters do not reconcile with vector outcomes');
  if(report?.ajvBaselineVectorMismatches!==ajvBaselineMismatches||report?.ajvBaselineVectorErrors!==ajvBaselineErrors||report?.ajvNativeVectorErrors!==ajvExportedErrors||report?.ajvVectorErrors!==ajvVectorErrors||report?.ajvCompileFailures!==ajvCompileFailureCases.size||report?.ajvNativeCompileFailures!==ajvNativeCompileFailureCases.size) fail(`Ajv aggregate counters do not reconcile with vector outcomes (baseline mismatches ${report?.ajvBaselineVectorMismatches}/${ajvBaselineMismatches}, baseline errors ${report?.ajvBaselineVectorErrors}/${ajvBaselineErrors}, exported errors ${report?.ajvNativeVectorErrors}/${ajvExportedErrors}, all errors ${report?.ajvVectorErrors}/${ajvVectorErrors}, baseline compile cases ${report?.ajvCompileFailures}/${ajvCompileFailureCases.size}, exported compile cases ${report?.ajvNativeCompileFailures}/${ajvNativeCompileFailureCases.size})`);
  if(report?.ajvNativeVectorMismatches!==exportedExpectedMismatch||report?.ajvNativeParityVectorMismatches!==exportedParityMismatch||exportedParityMismatch!==0) fail('Original/exported semantic parity mismatches are present or miscounted');
  if(report?.ajvNativeParityVectorsCompared!==exportedCompared||report?.ajvNativeParityVectorsNotCompared!==exportedUnavailable||report?.ajvNativeParityCasesNotCompared!==exportedCasesUnavailable) fail('Exported-schema comparison counters do not reconcile with vector outcomes');
  if(report?.adapterFailures!==adapterFailures||adapterFailures!==0) fail('Adapter preservation evidence failed or does not reconcile');
  if(report?.compileFailures!==compileFailures) fail('Rust compile/refusal count does not reconcile');
  return {accepted:failures.length===0,failures,exclusions:allowed.size};
}

if(import.meta.main) {
  const reportPath=Bun.argv[2]??'/private/tmp/umf-r5-json-schema-comparison.json';
  const rawPath=Bun.argv[3];
  const exclusionsPath=Bun.argv[4]??'scripts/rust-migration/r5/json-schema/ajv-exclusions.json';
  if(!rawPath) throw new Error('Usage: acceptance.ts <comparison-report> <raw-capture> [exclusions]');
  const reportBytes=await readFile(reportPath),rawBytes=await readFile(rawPath);
  const report=JSON.parse(reportBytes.toString('utf8'));
  const raw=JSON.parse(rawBytes.toString('utf8'));
  const rawSha=createHash('sha256').update(rawBytes).digest('hex');
  raw.__sha256=rawSha;
  raw.__path=rawPath;
  const requiredClosure=requiredSourceClosurePaths();
  const closure=report?.sourceClosure?.sha256;
  if(!closure || typeof closure!=='object') throw new Error('Source closure hashes are missing');
  const closureKeys=Object.keys(closure).sort();
  if(JSON.stringify(closureKeys)!==JSON.stringify(requiredClosure)) throw new Error('Source closure path set does not match the runner capture inventory');
  for(const relative of requiredClosure) {
    const expectedHash=closure[relative];
    const actual=createHash('sha256').update(await readFile(relative)).digest('hex');
    if(actual!==expectedHash) throw new Error(`Captured source closure changed: ${relative}`);
  }
  const exclusions=JSON.parse(await readFile(exclusionsPath,'utf8'));
  const expected=await loadExpectedCases();
  const result=assess(report,raw,exclusions,expected,requiredClosure);
  console.log(JSON.stringify({reportPath,rawPath,rawSha256:rawSha,...result},null,2));
  if(!result.accepted) process.exitCode=1;
}
