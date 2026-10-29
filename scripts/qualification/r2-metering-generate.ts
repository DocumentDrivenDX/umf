// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Function-only generator. It emits a private evidence artifact and never
 * imports or evaluates that artifact or writes tracked source files.
 */
import {lstat,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {structuralAccountingSource} from '../metamodel/structural-accounting';

const INPUTS=[
 {path:'src/generated/core-validators.ts',sha256:'563602e0f21f6d6b0efd1ae069dbda28926e085585b4bf0430347b65ff2bd0ff',kind:'source'},
 {path:'spec/core/schema.json',sha256:'c6004664eb93dcef28ce6e0583f91225b618aa0fb42967a892242402557cf71d',kind:'schema'},
 {path:'spec/core/semantic-type-reference.schema.json',sha256:'207abbad54ebf8c660a958e2deda072a5a3236b5b8df5af8a8656f90c3e46ba9',kind:'schema'},
 {path:'spec/core/extension-package.schema.json',sha256:'4df3c8f92c5baa2c52f965d83b681ff306392bf9ba333bd39213a8f1065ac766',kind:'schema'},
] as const;
type OutputPurpose='stage-a'|'stage-b-reproduction';
function outputPurpose():OutputPurpose{
 const value=process.env.UMF_R2_OUTPUT_PURPOSE??'stage-a';
 if(value!=='stage-a'&&value!=='stage-b-reproduction')throw new Error('R2_METERING_OUTPUT_PURPOSE');
 return value;
}
const LOCKED_FILES=[
 {path:'package.json',sha256:'c7b69fba001805dc9cd4e26e84a9b786be379c1413d020c34600c063d287101b'},
 {path:'bun.lock',sha256:'5fb58795dfe9ef5df89597c44372cf2a0739e1855f322f7622ae0c9d0ac71ce4'},
 {path:'bunfig.toml',sha256:'b9fc65eca9014c5179380259d70e76385a6a80788fa9a2df5fb3eaa5554fd2fe'},
 {path:'scripts/metamodel/structural-accounting.ts',sha256:'a5071f3512145e772007339c80de8100d95c873279d9fda519eef5be6681e9b7'},
] as const;
const sha256=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
function requireHash(path:string,actual:string,expected:string):void{
 if(actual!==expected)throw new Error(`R2_METERING_INPUT_MISMATCH:${path}:${actual}`);
}
async function freshDirectory():Promise<string>{
 const runnerTemp=process.env.RUNNER_TEMP;
 const runId=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT;
 const purpose=outputPurpose();
 if(!runnerTemp||!runId||!attempt||!/^\d+$/.test(runId)||!/^\d+$/.test(attempt))throw new Error('R2_METERING_RUN_IDENTITY');
 const suffix=purpose==='stage-b-reproduction'?'-reproduction':'';
 const parent=resolve(runnerTemp),destination=join(parent,`r2-metering-generated-${runId}-${attempt}${suffix}`);
 if(resolve(destination)!==destination||resolve(destination,'..')!==parent)throw new Error('R2_METERING_OUTPUT_PATH');
 try{await lstat(destination);throw new Error('R2_METERING_OUTPUT_EXISTS');}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 await mkdir(destination,{recursive:false,mode:0o700});
 return destination;
}
async function main():Promise<void>{
 const {GITHUB_EVENT_NAME:eventName,GITHUB_REF:ref,GITHUB_SHA:sha,GITHUB_WORKFLOW_REF:workflowRef,GITHUB_WORKFLOW_SHA:workflowSha}=process.env;
 const purpose=outputPurpose();
 const acceptedRef=ref==='refs/heads/codex/migration-metering-qualification'||(purpose==='stage-a'&&ref==='refs/heads/codex/migration-main-metering-generation')||(purpose==='stage-b-reproduction'&&ref==='refs/heads/codex/migration-integrated-qualification');
 if(eventName!=='push'||!acceptedRef||!sha||!workflowRef||!workflowSha)throw new Error('R2_METERING_EVENT_IDENTITY');
 const readInputs=[] as {path:string;kind:string;sha256:string;bytes:number;contents:Uint8Array}[];
 for(const input of INPUTS){
  const contents=await readFile(join(root,input.path));
  const digest=sha256(contents);requireHash(input.path,digest,input.sha256);
  readInputs.push({path:input.path,kind:input.kind,sha256:digest,bytes:contents.byteLength,contents});
 }
 for(const file of LOCKED_FILES){
  requireHash(file.path,sha256(await readFile(join(root,file.path))),file.sha256);
 }
 const source= new TextDecoder('utf-8',{fatal:true}).decode(readInputs[0]!.contents);
 const schemas=readInputs.slice(1).map((input)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input.contents)) as unknown);
 const destination=await freshDirectory();
 const companion=structuralAccountingSource(source,schemas);
 const companionBytes=new TextEncoder().encode(companion);
 const companionPath=join(destination,'core-validators-accounted.ts');
 await writeFile(companionPath,companionBytes,{flag:'wx',mode:0o600});
 const manifest={
  profile:'umf.r2-metering-generated-companion/1',
  run:{eventName,id:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,sha,ref,workflowRef,workflowSha},
  inputs:readInputs.map(({path,kind,sha256,bytes})=>({path,kind,sha256,bytes})),
  lockedFiles:LOCKED_FILES,
  generator:{path:'scripts/metamodel/structural-accounting.ts',invocationCount:1,outputPurpose:purpose},
  output:{path:'core-validators-accounted.ts',sha256:sha256(companionBytes),bytes:companionBytes.byteLength},
  execution:{artifactOnly:true,companionEvaluated:false,publicValidatorChanged:false},
 };
 await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify({outputDirectory:destination,output:manifest.output,inputs:manifest.inputs})+'\n');
}
if(import.meta.main)await main();
