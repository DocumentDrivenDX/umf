/** Candidate reproducibility and immutable released-producer reproduction are separate checks. */
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyPackage,verifyCleanBuilds} from './schema-browser-integrity';
const originalRevision='00755f5d2b76696b14a4750214c66f1209560939';
const originalRuntime='1.3.14',originalVersion='1.1.2';
const originalLock='2905b77b247fd271f43010349ac10ee43b13a9ff0cb43b227b92304e60475a32';
const root=await mkdtemp(join(tmpdir(),'umf-browser-repro-'));
const hash=async(path:string)=>new Bun.CryptoHasher('sha256').update(await Bun.file(path).bytes()).digest('hex');
async function build(source:string,output:string){
 const child=Bun.spawn([process.execPath,join(source,'docs/helix/05-deploy/schema-browser/build.ts'),output],{cwd:source,stdout:'inherit',stderr:'inherit'});
 if(await child.exited)throw Error('Producer build failed');
}
try{
 for(const name of ['first','second'])await build(process.cwd(),join(root,name));
 const a=await Bun.file(join(root,'first/release-manifest.json')).json(),b=await Bun.file(join(root,'second/release-manifest.json')).json();
 if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Clean candidate payloads differ: '+Object.keys(a.sha256).filter(key=>a.sha256[key]!==b.sha256[key]).join(', '));
 console.log('Two clean current-source candidate builds have identical complete SHA-256 manifests; this does not relabel the installed release.');
 const installed=resolve('node_modules/@documentdrivendx/umf-schema-browser');
 {
  if(!await Bun.file(join(installed,'asset-manifest.json')).exists())throw Error('Required installed release asset manifest missing');
  if(await hash(join(installed,'provenance.json'))!=='a85da3c42f90c4d37dbc5236d65ad440116f42a7e17b2d3c76e137b9e9606a3a')throw Error('Installed original provenance inventory mismatch');
  if(process.argv.length!==4||process.argv[2]!=='--original-source')throw Error('Installed release verification requires --original-source <detached original checkout>');
  const source=resolve(process.argv[3]!),provenance=await Bun.file(join(installed,'provenance.json')).json();
  if(provenance.revision!==originalRevision||provenance.packageVersion!==originalVersion||provenance.bun!==originalRuntime||provenance.lockfileSha256!==originalLock)throw Error('Installed release provenance differs from qualified original producer');
  const revision=Bun.spawnSync(['git','rev-parse','HEAD'],{cwd:source});
  if(revision.exitCode!==0||revision.stdout.toString().trim()!==originalRevision)throw Error('Original producer checkout revision mismatch');
  if(Bun.version!==originalRuntime)throw Error('Original producer Bun runtime mismatch');
  if(await hash(join(source,'bun.lock'))!==originalLock)throw Error('Original producer lockfile mismatch');
  for(const [file,digest] of Object.entries(provenance.inputs)){
   const path=resolve(source,file);
   if(!path.startsWith(source+'/')||await hash(path)!==digest)throw Error('Original producer input mismatch: '+file);
  }
  const output=join(root,'original');await build(source,output);
  const produced=await Bun.file(join(output,'asset-manifest.json')).json(),released=await Bun.file(join(installed,'asset-manifest.json')).json();
  if(JSON.stringify(produced)!==JSON.stringify(released))throw Error('Original producer runtime assets differ from exact installed release');
  const original=await Bun.file(join(output,'release-manifest.json')).json();
  for(const name of ['index.js',...Object.keys(original.sha256).filter(name=>name.startsWith('types/'))])if(await hash(join(installed,name))!==original.sha256[name])throw Error('Original producer exported API differs from exact installed release: '+name);
  console.log('Installed schema-browser 1.1.2 reproduced from its original source, locked inputs and Bun runtime; current candidate remains separate.');
 }
}finally{await rm(root,{recursive:true,force:true});}
