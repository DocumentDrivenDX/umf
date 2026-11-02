// SPDX-License-Identifier: MIT OR Apache-2.0
/** Candidate reproducibility and immutable released-producer reproduction are separate checks. */
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyPackage,verifyCleanBuilds} from './schema-browser-integrity';
const producerRevision='cc23e6574eb669ea89b56425e37aa9256d9b5f4a';
const producerRuntime='1.4.2',producerVersion='2.1.0';
const producerLock='9d51335710cdfc68519a245a697e9cb876155a7cd70e58f7a1b00e1af86a40db';
const root=await mkdtemp(join(tmpdir(),'umf-browser-repro-'));
const hash=async(path:string)=>new Bun.CryptoHasher('sha256').update(await Bun.file(path).bytes()).digest('hex');
async function build(source:string,output:string,sourceBoundWasm=true){
 const script=sourceBoundWasm?'scripts/build-schema-browser.ts':'docs/helix/05-deploy/schema-browser/build.ts';
 const child=Bun.spawn([process.execPath,join(source,script),output],{cwd:source,stdout:'inherit',stderr:'inherit'});
 if(await child.exited)throw Error('Producer build failed');
}
try{
 const installed=resolve('node_modules/@documentdrivendx/umf-schema-browser');
 {
  if(!await Bun.file(join(installed,'asset-manifest.json')).exists())throw Error('Required installed release asset manifest missing');
  if(await hash(join(installed,'provenance.json'))!=='f9d1252bf83753a021e6a6bfea30f9acf8d426ebc705e7f7a9f61d55ce0bf551')throw Error('Installed release provenance inventory mismatch');
  if(process.argv.length!==4||process.argv[2]!=='--producer-source')throw Error('Installed release verification requires --producer-source <detached producer checkout>');
  const source=resolve(process.argv[3]!),provenance=await Bun.file(join(installed,'provenance.json')).json();
  if(provenance.revision!==producerRevision||provenance.packageVersion!==producerVersion||provenance.bun!==producerRuntime||provenance.lockfileSha256!==producerLock)throw Error('Installed release provenance differs from qualified release producer');
  const revision=Bun.spawnSync(['git','rev-parse','HEAD'],{cwd:source});
  if(revision.exitCode!==0||revision.stdout.toString().trim()!==producerRevision)throw Error('Released producer checkout revision mismatch');
  if(Bun.version!==producerRuntime)throw Error('Released producer Bun runtime mismatch');
  if(await hash(join(source,'bun.lock'))!==producerLock)throw Error('Released producer lockfile mismatch');
  for(const [file,digest] of Object.entries(provenance.inputs)){
   const path=resolve(source,file);
   if(!path.startsWith(source+'/')||await hash(path)!==digest)throw Error('Released producer input mismatch: '+file);
  }
  const output=join(root,'producer');await build(source,output);
  const produced=await Bun.file(join(output,'asset-manifest.json')).json(),released=await Bun.file(join(installed,'asset-manifest.json')).json();
  if(JSON.stringify(produced)!==JSON.stringify(released)){
   const names=[...new Set([...Object.keys(produced.assets??{}),...Object.keys(released.assets??{})])].sort();
   const mismatches=names.filter(name=>produced.assets?.[name]!==released.assets?.[name]).map(name=>({name,expected:released.assets?.[name]??null,actual:produced.assets?.[name]??null}));
   throw Error('Released producer runtime assets differ from exact installed release: '+JSON.stringify({total:mismatches.length,assets:mismatches.slice(0,12),inventoryOrderOnly:mismatches.length===0}));
  }
  verifyCleanBuilds(await verifyPackage(output),await verifyPackage(installed));
  const producer=await Bun.file(join(output,'release-manifest.json')).json();
  for(const name of ['index.js',...Object.keys(producer.sha256).filter(name=>name.startsWith('types/'))])if(await hash(join(installed,name))!==producer.sha256[name])throw Error('Released producer exported API differs from exact installed release: '+name);
  console.log('Installed schema-browser 2.1.0 reproduced from its producer source, locked inputs and Bun runtime; current candidate remains separate.');
 }
 // Keep the complete current-source check after immutable producer equality;
 // mismatched release environments now fail before two extra native builds.
 for(const name of ['first','second'])await build(process.cwd(),join(root,name));
 const a=await Bun.file(join(root,'first/release-manifest.json')).json(),b=await Bun.file(join(root,'second/release-manifest.json')).json();
 if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Clean candidate payloads differ: '+Object.keys(a.sha256).filter(key=>a.sha256[key]!==b.sha256[key]).join(', '));
 console.log('Two clean current-source candidate builds have identical complete SHA-256 manifests; this does not relabel the installed release.');

}finally{await rm(root,{recursive:true,force:true});}
