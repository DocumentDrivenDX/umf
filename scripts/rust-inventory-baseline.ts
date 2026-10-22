// SPDX-License-Identifier: MIT OR Apache-2.0
/** Capture exact current codegen-entry operation responses against checked-in bundle. */
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve(import.meta.dir,'..');
const out=resolve(root,'docs/helix/04-build/evidence/rust-migration/r0/codegen-baseline.json');
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const temp=join(tmpdir(),`umf-rust-r0-${process.pid}`);
await mkdir(temp,{recursive:true});
const run=async (script:string,file:string)=>{
  const result=spawnSync('bun',[script,file],{cwd:root,encoding:'utf8'});
  if(result.status!==0)throw new Error(`${script} failed: ${result.stderr||result.stdout}`);
  return JSON.parse(await readFile(file,'utf8'));
};

// Existing corpus producers use the portable implementation to create pinned positive/refusal inputs.
const genPath=join(temp,'generate.json'),deployPath=join(temp,'deployment.json'),migrationPath=join(temp,'migration.json');
await run('scripts/codegen-corpus.ts',genPath);
await run('scripts/table-deployment-corpus.ts',deployPath);
await run('scripts/table-migration-corpus.ts',migrationPath);
const genCorpus=JSON.parse(await readFile(genPath,'utf8'));
const deployCorpus=JSON.parse(await readFile(deployPath,'utf8'));
const migrationCorpus=JSON.parse(await readFile(migrationPath,'utf8'));
const assetRoot=resolve(root,'python/umf_codegen/src/umf_codegen/_assets');
const manifestBytes=await readFile(join(assetRoot,'manifest.json'));
const manifest=JSON.parse(manifestBytes.toString('utf8'));
const build=await Bun.build({entrypoints:[resolve(root,'scripts/codegen/entry.ts')],target:'browser',format:'iife',minify:true,metafile:true,
  banner:'// SPDX-License-Identifier: MIT OR Apache-2.0\n// Bundled dependencies retain their individual licenses in notices/.',naming:'generator.js',preserveSymlinks:true} as Parameters<typeof Bun.build>[0] & {preserveSymlinks:boolean});
if(!build.success||!build.metafile||Object.values(build.metafile.outputs).some(item=>item.imports.length))throw new Error(build.logs.map(log=>log.message).join('\n')||'Codegen entry did not produce one self-contained bundle');
const bundle=await build.outputs[0]!.text();
const bundleBytes=Buffer.from(bundle,'utf8');
const checkedInBundle=gunzipSync(await readFile(join(assetRoot,'generator.js.gz')));
if(!checkedInBundle.equals(bundleBytes))throw new Error('Source-built codegen entry differs from the checked-in compressed payload');
new Function(bundle)();
const invoke=(name:string,input:string)=>{
  const fn=(globalThis as Record<string,unknown>)[name];
  if(typeof fn!=='function')throw new Error(`bridge operation missing: ${name}`);
  return (fn as (arg:string)=>string)(input);
};
type Vector={operation:string;case:string;input:unknown;inputUtf8:string;inputBytes:number;inputSha256:string;response:string;responseBytes:number;responseSha256:string;outcome:'ok'|'refusal';refusalCode?:string};
const vectors:Vector[]=[];
function add(operation:string,caseName:string,bridgeName:string,input:unknown){
  const inputText=JSON.stringify(input),response=invoke(bridgeName,inputText),parsed=JSON.parse(response);
  const refused=!parsed.ok||parsed.result?.status==='blocked';
  const refusalCode=parsed.ok?parsed.result?.diagnostics?.[0]?.code:parsed.error?.code;
  vectors.push({operation,case:caseName,input,inputUtf8:inputText,inputBytes:Buffer.byteLength(inputText),inputSha256:digest(inputText),response,responseBytes:Buffer.byteLength(response),responseSha256:digest(response),outcome:refused?'refusal':'ok',...(refusalCode?{refusalCode}:{})});
  return parsed;
}
for(const c of genCorpus)add('generate',c.name,'__umf_codegen',c.request);
for(const c of deployCorpus){
  const result=add('deployment',c.name,'__umf_table_deploy',c.request);
  if(result.ok&&result.result.status==='compiled')add('verify_deployment',`${c.name}:compiled-bundle`,'__umf_table_verify',{bundle:result.result.bundle});
}
add('verify_deployment','malformed-empty-bundle','__umf_table_verify',{bundle:{}});
for(const c of migrationCorpus){
  const result=add('migration',c.name,'__umf_table_migrate',c.request);
  if(result.ok&&result.result.status==='compiled')add('verify_migration',`${c.name}:compiled-plan`,'__umf_table_migration_verify',{plan:result.result.plan});
}
add('verify_migration','malformed-empty-plan','__umf_table_migration_verify',{plan:{}});
const operations=['generate','deployment','verify_deployment','migration','verify_migration'];
const result={schema:'umf.rust-migration-codegen-baseline/0.1',scope:'Current codegen entry IIFE operations; exact request/response UTF-8 bytes represented as JSON strings with SHA-256; this is a pre-Rust source baseline.',capture:{builder:`bun@${Bun.version}`,executionRuntime:`Bun ${Bun.version} process realm`,bundleSha256:digest(bundleBytes),bundleUtf8Bytes:Buffer.byteLength(bundle),manifestSha256:digest(manifestBytes),manifest,sourceBundledInputs:Object.keys(build.metafile.inputs).sort(),pythonDispatchRuntimeExpected:'mini-racer==0.14.1; V8 14.4.258.23',pythonDispatchExecution:'not run: py_mini_racer 0.14.1 is not installed in this worktree host; baseline invokes all five entry bridge functions from the byte-identical checked-in IIFE under Bun.',limits:['The baseline captures current entry behavior and bytes under Bun; it does not claim independent parity with the pinned MiniRacer V8 runtime.','Native deployment lifecycle and authorization remain outside these portable compiler/verifier operations.']},operations:Object.fromEntries(operations.map(operation=>[operation,{vectors:vectors.filter(v=>v.operation===operation).length,accepted:vectors.filter(v=>v.operation===operation&&v.outcome==='ok').length,refused:vectors.filter(v=>v.operation===operation&&v.outcome==='refusal').length}])),vectors};
await writeFile(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output:out.slice(root.length+1),operations:result.operations,bundleSha256:result.capture.bundleSha256}));
