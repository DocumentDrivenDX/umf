// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {assess, validateManifestPathClosure, type ExpectedCase} from '../../scripts/rust-migration/r5/json-schema/acceptance';

const cases:ExpectedCase[]=[{file:'case.json',index:0,expected:[true]}];
const noExclusions={schema:'umf-r5-json-schema-exclusions/v1',items:[]};
function fixture() {
  const raw:any={sourceRevision:'ab079cc2bace029fdbb483be28a6ade526bcfbc2',dialect:'2020-12',files:1,cases:1,vectors:1,records:[{
    file:'case.json',index:0,vectorCount:1,compileError:null,vectors:[{index:0,expected:true,rust:{Ok:true}}],
    adapter:{Ok:{rootExact:true,resourcesExact:true,getRoot:'{}',originalRoot:'{}'}},
  }],__sha256:'a'.repeat(64),__path:'/raw.json'};
  const report:any={sourceRevision:raw.sourceRevision,dialect:raw.dialect,files:1,cases:1,vectors:1,
    rustCapture:{status:'passed',rawReport:'/raw.json',rawReportSha256:raw.__sha256},
    sourceClosure:{status:'pre-post-identical-during-capture',fileCount:1,sha256:{'src.rs':'b'.repeat(64)}},
    missingRustCases:0,rustVectorsExecuted:1,rustVectorsNotCompiled:0,rustVectorErrors:0,rustExpectedComparisons:1,rustExpectedDisagreements:0,
    rustAjvComparisons:1,rustAjvDisagreements:0,compileFailures:0,adapterFailures:0,
    ajvBaselineVectorMismatches:0,ajvBaselineVectorErrors:0,ajvVectorErrors:0,ajvCompileFailures:0,
    ajvNativeCompileFailures:0,ajvNativeVectorErrors:0,ajvNativeVectorMismatches:0,ajvNativeParityVectorMismatches:0,
    ajvNativeParityVectorsCompared:1,ajvNativeParityVectorsNotCompared:0,ajvNativeParityCasesNotCompared:0,
    records:[{file:'case.json',index:0,vectors:1,adapterStable:true,vectorOutcomes:[{index:0,expected:true,rust:{status:'result',valid:true},ajv:{status:'result',valid:true},exported:{status:'result',valid:true}}]}],
  };
  return {report,raw};
}
const run=(report:any,raw:any,exclusions:any=noExclusions,closurePaths:string[]=['src.rs'])=>assess(report,raw,exclusions,cases,closurePaths);

test('complete source-linked capture passes the synthetic gate',()=>{
  const {report,raw}=fixture();
  expect(run(report,raw).accepted).toBe(true);
});

test('manifest hashes cover the exact corpus file tree',()=>{
  expect(()=>validateManifestPathClosure(['draft/a.json','remotes/r.json'],['manifest.json','draft/a.json','remotes/r.json'])).not.toThrow();
  expect(()=>validateManifestPathClosure(['draft/a.json'],['manifest.json','draft/a.json','remotes/r.json'])).toThrow();
  expect(()=>validateManifestPathClosure(['draft/a.json','draft/a.json'],['draft/a.json'])).toThrow();
});

test('missing, fabricated, duplicated, or malformed corpus records fail closed',()=>{
  const {report,raw}=fixture();
  expect(run({...report,records:[]},raw).accepted).toBe(false);
  expect(run(report,{...raw,records:[]}).accepted).toBe(false);
  expect(run({...report,records:[...report.records,...report.records]},raw).accepted).toBe(false);
  expect(run({...report,records:[{...report.records[0],vectorOutcomes:[]}]},raw).accepted).toBe(false);
  expect(run({...report,rustCapture:{...report.rustCapture,rawReportSha256:'c'.repeat(64)}},raw).accepted).toBe(false);
  expect(run({...report,sourceClosure:{status:'unknown',fileCount:0,sha256:{}}},raw).accepted).toBe(false);
  expect(run(report,raw,noExclusions,['Cargo.toml','src.rs']).accepted).toBe(false);
});

test('archived raw bytes replay by SHA while altered raw bytes fail linkage',()=>{
  const {report,raw}=fixture();
  const archived={...raw,__path:'/repo/docs/evidence/rust-raw.json'};
  expect(run(report,archived).accepted).toBe(true);
  expect(run(report,{...archived,__sha256:'c'.repeat(64)}).accepted).toBe(false);
});

test('an Ajv exclusion cannot waive original-versus-exported semantic drift',()=>{
  const {report,raw}=fixture();
  const exclusion={schema:'umf-r5-json-schema-exclusions/v1',items:[{case:'case.json:0',kind:'ajv-defect',reason:'Synthetic Ajv disagreement.'}]};
  const drift={...report,ajvBaselineVectorMismatches:1,ajvNativeVectorMismatches:1,ajvNativeParityVectorMismatches:1,
    rustAjvDisagreements:1,records:[{...report.records[0],vectorOutcomes:[{...report.records[0].vectorOutcomes[0],ajv:{status:'result',valid:false},exported:{status:'result',valid:true}}]}]};
  expect(run(drift,raw,exclusion).accepted).toBe(false);
});

test('catalogued Ajv baseline disagreement is allowed only when Rust matches upstream',()=>{
  const {report,raw}=fixture();
  const exclusion={schema:'umf-r5-json-schema-exclusions/v1',items:[{case:'case.json:0',kind:'ajv-defect',reason:'Synthetic pinned Ajv mismatch.'}]};
  const ajvMismatch={...report,ajvBaselineVectorMismatches:1,rustAjvDisagreements:1,ajvNativeVectorMismatches:1,records:[{...report.records[0],vectorOutcomes:[{...report.records[0].vectorOutcomes[0],ajv:{status:'result',valid:false},exported:{status:'result',valid:false}}]}]};
  expect(run(ajvMismatch,raw,exclusion).accepted).toBe(true);
  expect(run({...ajvMismatch,rustExpectedDisagreements:1,rustAjvDisagreements:1,
    records:[{...ajvMismatch.records[0],vectorOutcomes:[{...ajvMismatch.records[0].vectorOutcomes[0],rust:{status:'result',valid:false}}]}]},raw,exclusion).accepted).toBe(false);
});

test('explicit unsupported Ajv cases are recorded as unavailable, never as pass',()=>{
  const {report,raw}=fixture();
  const exclusion={schema:'umf-r5-json-schema-exclusions/v1',items:[{case:'case.json:0',kind:'unsupported',reason:'Synthetic Ajv compile limitation.'}]};
  const unavailable={...report,rustAjvComparisons:0,ajvCompileFailures:1,ajvNativeParityVectorsCompared:0,
    ajvNativeParityVectorsNotCompared:1,ajvNativeParityCasesNotCompared:1,
    records:[{...report.records[0],vectorOutcomes:[{...report.records[0].vectorOutcomes[0],ajv:{status:'compile-error',error:'unsupported'},exported:{status:'not-compared',reason:'original compile unavailable'}}]}]};
  expect(run(unavailable,raw,exclusion).accepted).toBe(true);
  expect(run({...unavailable,records:[{...unavailable.records[0],vectorOutcomes:[{...unavailable.records[0].vectorOutcomes[0],ajv:{status:'result',valid:true},exported:{status:'result',valid:true}}]}]},raw,exclusion).accepted).toBe(false);
  const wrongRustRaw={...raw,records:[{...raw.records[0],vectors:[{...raw.records[0].vectors[0],rust:{Ok:false}}]}]};
  const wrongRust={...unavailable,rustExpectedDisagreements:1,rustAjvComparisons:0,
    records:[{...unavailable.records[0],vectorOutcomes:[{...unavailable.records[0].vectorOutcomes[0],rust:{status:'result',valid:false}}]}]};
  expect(run(wrongRust,wrongRustRaw,exclusion).accepted).toBe(false);
});
