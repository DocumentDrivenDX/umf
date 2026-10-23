// SPDX-License-Identifier: MIT OR Apache-2.0
// Run from the repository root with: bun scripts/rust-migration/r5/json-schema/upstream-oracle.ts
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020';

const revision='ab079cc2bace029fdbb483be28a6ade526bcfbc2';
const root=resolve('fixtures/json-schema/upstream');
function recordBaselineCaseOutcome(compare:any,mismatches:number,errors:number):void {
  if(mismatches)compare.ajvDisagreementCases++;
  if(errors)compare.ajvVectorErrorCases++;
}
function recordNativeCaseOutcome(compare:any,baselineMismatches:number,baselineErrors:number,nativeMismatches:number,nativeErrors:number):void {
  if(nativeMismatches && !baselineMismatches)compare.ajvDisagreementCases++;
  if(nativeErrors && !baselineErrors)compare.ajvVectorErrorCases++;
}
{
  const synthetic:any={ajvDisagreementCases:0,ajvVectorErrorCases:0};
  recordBaselineCaseOutcome(synthetic,1,1);
  // Model exported-schema compilation failing after baseline evaluation: native accounting is skipped.
  if(synthetic.ajvDisagreementCases!==1 || synthetic.ajvVectorErrorCases!==1) throw new Error('Baseline case counters were lost on synthetic exported-schema compile failure');
  recordNativeCaseOutcome(synthetic,1,1,1,1);
  if(synthetic.ajvDisagreementCases!==1 || synthetic.ajvVectorErrorCases!==1) throw new Error('Baseline/native case counters double-counted a synthetic case');
}
async function captureSourceClosure():Promise<Record<string,string>> {
  const coreInputs=[...new Bun.Glob('crates/umf-core/src/**/*').scanSync('.')];
  const vendorInputs=[...new Bun.Glob('crates/umf-core/vendor/saphyr-parser/**/*').scanSync('.')];
  const files=[...new Set(['Cargo.toml','Cargo.lock','crates/umf-core/Cargo.toml','crates/umf-core/vendor/saphyr-parser/Cargo.toml','fixtures/json-schema/upstream/manifest.json','crates/umf-core/tests/r5_json_schema_full_corpus.rs','scripts/rust-migration/r5/json-schema/upstream-oracle.ts','docs/helix/04-build/evidence/rust-migration/r5-json-schema/upstream-oracle-harness.md',...coreInputs,...vendorInputs])].sort();
  return Object.fromEntries(await Promise.all(files.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
}
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
if(manifest.revision!==revision || manifest.dialect!=='2020-12' || manifest.rootFiles!==46 || manifest.rootCases!==384 || manifest.rootVectors!==1301) throw new Error('Upstream manifest identity/count mismatch');
for(const [relative,expected] of Object.entries<string>(manifest.sha256)) {
  const actual=createHash('sha256').update(await readFile(join(root,relative))).digest('hex');
  if(actual!==expected) throw new Error(`Pinned source digest mismatch: ${relative}`);
}
async function validateRustRecordClosure(report:any):Promise<void> {
  if(!Array.isArray(report.records)) throw new Error('Rust capture records are missing');
  const expected=new Map<string,boolean[]>();
  const sourceFiles=[...new Bun.Glob('*.json').scanSync(join(root,'draft2020-12'))].sort();
  for(const file of sourceFiles) {
    const cases=JSON.parse(await readFile(join(root,'draft2020-12',file),'utf8'));
    cases.forEach((entry:any,index:number)=>expected.set(`${file}:${index}`,entry.tests.map((v:any)=>v.valid)));
  }
  if(sourceFiles.length!==46 || expected.size!==384 || report.records.length!==expected.size) throw new Error('Rust capture record cardinality mismatch');
  const seen=new Set<string>();
  for(const record of report.records) {
    const key=`${record.file}:${record.index}`;
    const valid=expected.get(key);
    if(!valid || seen.has(key)) throw new Error(`Rust capture has an unknown or duplicate case key: ${key}`);
    seen.add(key);
    if(!Array.isArray(record.vectors) || record.vectors.length!==valid.length) throw new Error(`Rust vector count mismatch for ${key}`);
    record.vectors.forEach((vector:any,index:number)=>{
      if(vector.index!==index || vector.expected!==valid[index]) throw new Error(`Rust vector identity mismatch for ${key} vector ${index}`);
    });
  }
  if(seen.size!==expected.size) throw new Error('Rust capture omitted one or more upstream case keys');
}
const temp=await mkdtemp(join(tmpdir(),'umf-r5-json-schema-'));
const freshRustPath=join(temp,'fresh-rust-report.json');
const rustPath=resolve(process.env.UMF_R5_JSON_SCHEMA_RAW_CAPTURE ?? '/private/tmp/umf-r5-json-schema-rust-raw.json');
const resultPath=resolve(process.env.UMF_R5_JSON_SCHEMA_OUTPUT ?? '/private/tmp/umf-r5-json-schema-comparison.json');
const sourceClosureBefore=await captureSourceClosure();
try {
  let rustReport:any=null;
  let rustCapture:any={status:'passed'};
  if(process.env.UMF_R5_SKIP_RUST==='1') rustCapture={status:'skipped',reason:'UMF_R5_SKIP_RUST=1'};
  else {
    const rust=spawnSync('cargo',['test','--locked','-p','umf-core','--test','r5_json_schema_full_corpus','capture_pinned_upstream_rust_and_native_adapter_results','--','--exact','--nocapture'],{encoding:'utf8',env:{...process.env,UMF_R5_JSON_SCHEMA_REPORT:freshRustPath}});
    if(rust.error?.code==='ENOENT') rustCapture={status:'unavailable',reason:`Rust capture could not start: ${rust.error.message}`};
    else if(rust.error) throw new Error(`Rust capture could not start: ${rust.error.message}`);
    else if(rust.status!==0) throw new Error(`Rust capture failed with status ${rust.status}:\n${rust.stdout}\n${rust.stderr}`);
    else {
      const testLine='test capture_pinned_upstream_rust_and_native_adapter_results ... ok';
      if(!rust.stdout.includes(testLine)) throw new Error(`Cargo exited successfully without executing the exact Rust capture test; output:\n${rust.stdout}\n${rust.stderr}`);
      const rawFresh=await readFile(freshRustPath);
      rustReport=JSON.parse(rawFresh.toString('utf8'));
      if(rustReport.sourceRevision!==revision || rustReport.files!==46 || rustReport.cases!==384 || rustReport.vectors!==1301) throw new Error('Rust capture does not match pinned corpus');
      await validateRustRecordClosure(rustReport);
      await mkdir(dirname(rustPath),{recursive:true});
      await writeFile(rustPath,rawFresh);
    }
  }
  for(const [relative,expected] of Object.entries<string>(manifest.sha256)) {
    const actual=createHash('sha256').update(await readFile(join(root,relative))).digest('hex');
    if(actual!==expected) throw new Error(`Pinned source changed during qualification: ${relative}`);
  }

  const remotes=new Map<string,string>();
  for(const path of new Bun.Glob('**/*.json').scanSync(join(root,'remotes'))) remotes.set(`http://localhost:1234/${path}`,await readFile(join(root,'remotes',path),'utf8'));
  const sourceClosureAfter=await captureSourceClosure();
  if(rustReport && !isDeepStrictEqual(sourceClosureBefore,sourceClosureAfter)) throw new Error('Rust source closure changed during corpus capture');
  const sourceClosure={status:rustReport?'pre-post-identical-during-capture':'postrun-observation-only-no-rust-capture',sha256:sourceClosureAfter,fileCount:Object.keys(sourceClosureAfter).length};
  const rawCaptureSha256=rustReport?createHash('sha256').update(await readFile(rustPath)).digest('hex'):null;
  const ajvPackage=JSON.parse(await readFile('node_modules/ajv/package.json','utf8'));
  if(ajvPackage.version!=='8.20.0') throw new Error(`Ajv version mismatch: ${ajvPackage.version}`);
  const compare:any={sourceRevision:revision,dialect:'2020-12',oracle:'Ajv 8.20.0; strict=false; validateFormats=false; ownProperties=true; addUsedSchema=false; resources explicitly preloaded; no implicit network',rustCapture:{...rustCapture,rawReport:rustReport?rustPath:null,rawReportSha256:rawCaptureSha256},sourceClosure,files:0,cases:0,vectors:0,compileFailures:0,missingRustCases:0,rustVectorsExecuted:0,rustVectorsNotCompiled:0,rustVectorsNotRun:0,rustVectorErrors:0,adapterFailures:0,ajvCompileFailures:0,ajvNativeCompileFailures:null,ajvVectorErrors:0,ajvBaselineVectorErrors:0,ajvNativeVectorErrors:null,ajvVectorErrorCases:0,ajvBaselineVectorMismatches:0,ajvNativeVectorMismatches:null,ajvNativeParityVectorMismatches:null,ajvNativeParityVectorsCompared:null,ajvNativeParityVectorsNotCompared:null,ajvNativeParityCasesNotCompared:null,ajvDisagreementCases:0,rustExpectedDisagreements:null,rustExpectedComparisons:null,rustAjvDisagreements:null,rustAjvComparisons:null,records:[] as unknown[]};
  if(rustReport) {
    compare.ajvNativeVectorMismatches=0;
    compare.ajvNativeCompileFailures=0;
    compare.ajvNativeVectorErrors=0;
    compare.ajvNativeParityVectorMismatches=0;
    compare.ajvNativeParityVectorsCompared=0;
    compare.ajvNativeParityVectorsNotCompared=0;
    compare.ajvNativeParityCasesNotCompared=0;
    compare.rustExpectedDisagreements=0;
    compare.rustExpectedComparisons=0;
    compare.rustAjvDisagreements=0;
    compare.rustAjvComparisons=0;
  }
  const files=[...new Bun.Glob('*.json').scanSync(join(root,'draft2020-12'))].sort(); compare.files=files.length;
  const rustRecords=new Map<string,any>((rustReport?.records ?? []).map((r:any)=>[`${r.file}:${r.index}`,r]));
  for(const file of files) {
    const source=await readFile(join(root,'draft2020-12',file),'utf8');
    const cases=JSON.parse(source);
    for(let index=0;index<cases.length;index++) {
      const c=cases[index], key=`${file}:${index}`, r=rustRecords.get(key);
      compare.cases++;
      const base=`https://umf.invalid/upstream/${file}/${index}`;
      const resources:Record<string,string>=Object.create(null);
      const visit=(value:any,uri:string):void=>{
        if(!value || typeof value!=='object') return;
        if(typeof value.$id==='string') {try{uri=new URL(value.$id,uri).href}catch{}}
        for(const k of ['$ref','$dynamicRef','$schema']) if(typeof value[k]==='string') {try {const target=new URL(value[k],uri).href.split('#')[0]!;const text=remotes.get(target);if(text && !Object.hasOwn(resources,target)){resources[target]=text;visit(JSON.parse(text),target)}}catch{}}
        for(const child of Object.values(value)) visit(child,uri);
      };
      visit(c.schema,base);
      const make=(schema:any,bundle:Record<string,string>)=>{
        const ajv=new Ajv2020({strict:false,validateFormats:false,ownProperties:true,addUsedSchema:false});
        for(const [uri,text] of Object.entries(bundle)) {const value=JSON.parse(text);if(value.$vocabulary)ajv.addMetaSchema(value,uri);else ajv.addSchema(value,uri)}
        ajv.addSchema(schema,base);return ajv.getSchema(base)!;
      };
      if(!r) {
        compare.missingRustCases++;
        if(rustCapture.status==='passed') compare.rustVectorsNotCompiled+=c.tests.length;
        else compare.rustVectorsNotRun+=c.tests.length;
        let ajv:any;
        try {
          ajv=make(c.schema,resources);
        } catch(error) {
          compare.ajvCompileFailures++;
          compare.vectors+=c.tests.length;
          (compare.records as any[]).push({file,index,description:c.description,vectors:c.tests.length,rust:'not-run',ajvCompileError:String(error)});
          continue;
        }
        let mismatchCount=0,errorCount=0;
        for(const vector of c.tests) {compare.vectors++;try {if(!!ajv(vector.data)!==vector.valid){compare.ajvBaselineVectorMismatches++;mismatchCount++;}}catch(error){compare.ajvVectorErrors++;compare.ajvBaselineVectorErrors++;errorCount++;}}
        if(mismatchCount)compare.ajvDisagreementCases++;
        if(errorCount)compare.ajvVectorErrorCases++;
        (compare.records as any[]).push({file,index,description:c.description,vectors:c.tests.length,rust:'not-run',ajv:'completed',ajvMismatches:mismatchCount,ajvVectorErrors:errorCount});
        continue;
      }
      if(r.compileError) compare.compileFailures++;
      for(const [vectorIndex,vectorResult] of r.vectors.entries()) {
        if(r.compileError || vectorResult?.rust == null) compare.rustVectorsNotCompiled++;
        else if(vectorResult.rust.Ok!==undefined) {
          compare.rustVectorsExecuted++;
          compare.rustExpectedComparisons++;
          if(vectorResult.rust.Ok!==c.tests[vectorIndex].valid) compare.rustExpectedDisagreements++;
        } else compare.rustVectorErrors++;
      }
      const adapter=r.adapter?.Ok;
      if(!adapter) {
        compare.adapterFailures++;
        compare.ajvNativeParityCasesNotCompared++;
        compare.ajvNativeParityVectorsNotCompared+=c.tests.length;
        let ajv:any;
        try {ajv=make(c.schema,resources);}
        catch(error) {compare.ajvCompileFailures++;compare.vectors+=c.tests.length;(compare.records as any[]).push({file,index,setupError:String(error)});continue;}
        let baselineMismatchCount=0,vectorErrorCount=0;
        for(const [vectorIndex,vector] of c.tests.entries()) {
          compare.vectors++;
          try {
            const ajvValid=!!ajv(vector.data), rustResult=r.vectors[vectorIndex]?.rust;
            if(ajvValid!==vector.valid){compare.ajvBaselineVectorMismatches++;baselineMismatchCount++;}
            if(rustResult?.Ok!==undefined) {compare.rustAjvComparisons++;if(rustResult.Ok!==ajvValid) compare.rustAjvDisagreements++;}
          } catch(error) {compare.ajvVectorErrors++;compare.ajvBaselineVectorErrors++;vectorErrorCount++;}
        }
        if(baselineMismatchCount)compare.ajvDisagreementCases++;
        if(vectorErrorCount)compare.ajvVectorErrorCases++;
        (compare.records as any[]).push({file,index,description:c.description,vectors:c.tests.length,adapterError:r.adapter?.Err ?? 'missing Rust adapter result',compileError:r.compileError,baselineMismatchCount,vectorErrorCount});
        continue;
      }
      const mismatches:any[]=[];
      let baselineMismatchCount=0,nativeMismatchCount=0,parityMismatchCount=0,baselineErrorCount=0,nativeErrorCount=0,parityComparedCount=0;
      let before:any;
      try {before=make(c.schema,resources);}
      catch(error) {
        compare.ajvCompileFailures++;
        compare.vectors+=c.tests.length;
        compare.ajvNativeParityCasesNotCompared++;
        compare.ajvNativeParityVectorsNotCompared+=c.tests.length;
        (compare.records as any[]).push({file,index,description:c.description,vectors:c.tests.length,ajvBaselineCompileError:String(error),ajvNativeParity:'not-compared'});
        continue;
      }
      const baselineResults:(boolean|null)[]=[];
      for(const [vectorIndex,vector] of c.tests.entries()) {
        compare.vectors++;
        try {
          const valid=!!before(vector.data);
          baselineResults.push(valid);
          if(valid!==vector.valid){compare.ajvBaselineVectorMismatches++;baselineMismatchCount++;}
          const rustResult=r.vectors[vectorIndex]?.rust;
          if(rustResult?.Ok!==undefined) {compare.rustAjvComparisons++;if(rustResult.Ok!==valid)compare.rustAjvDisagreements++;}
        } catch(error) {
          baselineResults.push(null);
          compare.ajvVectorErrors++;
          compare.ajvBaselineVectorErrors++;
          baselineErrorCount++;
        }
      }
      recordBaselineCaseOutcome(compare,baselineMismatchCount,baselineErrorCount);
      let after:any;
      try {after=make(JSON.parse(adapter.exportedRoot),adapter.exportedResources);}
      catch(error) {
        compare.adapterFailures++;
        compare.ajvNativeCompileFailures++;
        compare.ajvNativeParityCasesNotCompared++;
        compare.ajvNativeParityVectorsNotCompared+=c.tests.length;
        (compare.records as any[]).push({file,index,description:c.description,vectors:c.tests.length,compileError:r.compileError,adapterStable:adapter.rootExact && adapter.resourcesExact && isDeepStrictEqual(JSON.parse(adapter.getRoot),JSON.parse(adapter.originalRoot)),walkPositions:adapter.walkSchemaPositions,inspectionCodes:adapter.inspectionCodes,ajvNativeCompileError:String(error),ajvNativeParity:'not-compared',baselineMismatchCount,baselineErrorCount});
        continue;
      }
      for(const [vectorIndex,vector] of c.tests.entries()) {
        const baseline=baselineResults[vectorIndex];
        if(baseline===null) {compare.ajvNativeParityVectorsNotCompared++;continue;}
        try {
          const native=!!after(vector.data);
          if(native!==vector.valid){compare.ajvNativeVectorMismatches++;nativeMismatchCount++;}
          compare.ajvNativeParityVectorsCompared++;
          parityComparedCount++;
          if(baseline!==native){compare.ajvNativeParityVectorMismatches++;parityMismatchCount++;mismatches.push({description:vector.description,ajvBefore:baseline,ajvAfter:native});}
        } catch(error) {
          compare.ajvVectorErrors++;
          compare.ajvNativeVectorErrors++;
          nativeErrorCount++;
          compare.ajvNativeParityVectorsNotCompared++;
        }
      }
      recordNativeCaseOutcome(compare,baselineMismatchCount,baselineErrorCount,nativeMismatchCount,nativeErrorCount);
      if(parityComparedCount===0) compare.ajvNativeParityCasesNotCompared++;
      const parityStatus=parityMismatchCount?'mismatch':baselineErrorCount || nativeErrorCount?'incomplete':parityComparedCount===0?'not-compared':'pass';
      (compare.records as any[]).push({file,index,description:c.description,vectors:c.tests.length,compileError:r.compileError,adapterStable:adapter.rootExact && adapter.resourcesExact && isDeepStrictEqual(JSON.parse(adapter.getRoot),JSON.parse(adapter.originalRoot)),walkPositions:adapter.walkSchemaPositions,inspectionCodes:adapter.inspectionCodes,ajvNativeParity:parityStatus,ajvMismatches:mismatches,baselineMismatchCount,nativeMismatchCount,parityMismatchCount,baselineErrorCount,nativeErrorCount});
    }
  }
  if(compare.files!==46 || compare.cases!==384 || compare.vectors!==1301) throw new Error(`Comparison count mismatch: files=${compare.files} cases=${compare.cases} vectors=${compare.vectors}`);
  if(rustReport && compare.rustVectorsExecuted+compare.rustVectorsNotCompiled+compare.rustVectorErrors!==1301) throw new Error(`Rust vector accounting mismatch: executed=${compare.rustVectorsExecuted} notCompiled=${compare.rustVectorsNotCompiled} errors=${compare.rustVectorErrors}`);
  await writeFile(resultPath,JSON.stringify(compare,null,2)+'\n');
  console.log(JSON.stringify({resultPath,...Object.fromEntries(Object.entries(compare).filter(([k])=>k!=='records'))},null,2));
} finally { await rm(temp,{recursive:true,force:true}); }
