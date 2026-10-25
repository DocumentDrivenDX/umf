// Host-neutral packed-package replay for the opt-in synchronous V3 generator.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const repo=process.env.UMF_REPO_ROOT;
if(typeof repo!=='string')throw new Error('UMF_REPO_ROOT is required');
const candidate=await import('@umf/core/rust-codegen-candidate/v3');
const legacy=await import('@umf/core');
const {runLegacyReadProbe}=await import(pathToFileURL(`${repo}/scripts/rust-migration/r7/codegen-host-read-gate0-probe.mjs`).href);
const {runCumulativeHostResponseBudgetProbe}=await import(pathToFileURL(`${repo}/scripts/rust-migration/r7/codegen-host-read-v3-transport-budget-probe.mjs`).href);
const source=await readFile(`${repo}/tests/unified/commerce.json`,'utf8');
const nativeTable=await readFile(process.env.UMF_NATIVE_TABLE_FIXTURE,'utf8');
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const generator=await candidate.createPythonClientRustCandidateV3();
const expected=runLegacyReadProbe(legacy.generatePythonClient,source,nativeTable);
const actual=runLegacyReadProbe(generator,source,nativeTable);
if(canonical(actual)!==canonical(expected))throw new Error('Packed Node Gate0 differential mismatch');
const corpus=JSON.parse(await readFile(`${repo}/docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json`,'utf8'));
const cases=corpus.cases.filter(item=>item.operation==='generatePythonClient');
for(const item of cases){
 let observed;
 try{observed={ok:true,result:generator(item.request)};}
 catch(error){observed={ok:false,error:{code:error.code,message:error.message,path:error.path}};}
 if(canonical(observed)!==canonical(item.expected))throw new Error(`Packed Node R3 mismatch: ${item.id}`);
}
const invalidDocument=JSON.parse(source);invalidDocument.modules[0].actions=[{id:'legacy-action'}];
let recordReads=0,crossed;
try{generator({text:JSON.stringify(invalidDocument),package:'shop',get records(){recordReads++;throw new Error('must be gated');}});}
catch(error){crossed=error;}
if(recordReads!==0||crossed?.code!=='ACCESS_UNSUPPORTED')throw new Error('Packed Node crossed semantic gate mismatch');
let packageReads=0;const output=generator({text:source,get package(){packageReads++;return packageReads<=4?'shop':'x\ud800';}});
if(output.files[0]?.path!=='x\ud800/__init__.py')throw new Error('Packed Node UTF-16 path mismatch');
let recordsRead=false,throwFromMeter=true;
const controlled=await candidate.createPythonClientRustCandidateV3({controls:{meter(){if(recordsRead&&throwFromMeter){throwFromMeter=false;throw new Error('meter during host response decode');}}}});
let controlCode='';
try{controlled({text:source,package:'shop',get records(){recordsRead=true;return [{module:'commerce',element:'Customer'}];}});}
catch(error){controlCode=error.code??'';}
if(controlCode!=='METER_FAILURE')throw new Error(`Packed Node control decode returned ${controlCode}`);
const recovered=controlled({text:source,package:'shop',records:[{module:'commerce',element:'Customer'}]});
if(recovered.files.length===0)throw new Error('Packed Node did not recover');
const cumulativeBudget=await runCumulativeHostResponseBudgetProbe(candidate.createPythonClientRustCandidateV3,source);
if(cumulativeBudget.failedCode!=='METER_FAILURE'||cumulativeBudget.getterReadsAtFailure!==3||!cumulativeBudget.recovered)throw new Error('Packed Node cumulative host-response budget mismatch');
const selectionError=request=>{try{generator(request);return null;}catch(error){return {code:error.code,path:error.path,message:error.message};}};
const surrogateRecord=selectionError({text:source,package:'shop',records:[{module:'\ud800',element:'x'}]});
if(surrogateRecord?.code!=='ACCESS_UNSUPPORTED'||surrogateRecord.path!=='\ud800.x'||surrogateRecord.message!=='Selected Record not found')throw new Error(`Packed Node surrogate record selection mismatch: ${JSON.stringify(surrogateRecord)}`);
const surrogateAction=selectionError({text:source,package:'shop',actions:[{module:'\ud800',action:'x'}]});
if(surrogateAction?.code!=='ACCESS_UNSUPPORTED'||surrogateAction.path!=='\ud800.x'||surrogateAction.message!=='Selected Action not found')throw new Error(`Packed Node surrogate action selection mismatch: ${JSON.stringify(surrogateAction)}`);
console.log(JSON.stringify({runtime:process.version,gate0Observations:46,r3Cases:cases.length,crossedCode:crossed.code,recordReads,latePath:JSON.stringify(output.files[0]?.path),controlCode,recovered:true,cumulativeBudget,surrogateRecord,surrogateAction}));
