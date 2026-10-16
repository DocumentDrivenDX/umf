/** Two clean producer builds must produce identical complete payloads. */
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyPackage,verifyCleanBuilds,releaseParity} from './schema-browser-integrity';
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--release-parity'))throw Error('Usage: bun scripts/schema-browser-reproducibility.ts [--release-parity]');
const root=await mkdtemp(join(tmpdir(),'umf-browser-repro-'));
try{
 for(const name of ['first','second']){const build=Bun.spawn([process.execPath,'docs/helix/05-deploy/schema-browser/build.ts',join(root,name)],{stdout:'inherit',stderr:'inherit'});if(await build.exited)throw Error('Producer build failed');}
 const first=await verifyPackage(join(root,'first')),second=await verifyPackage(join(root,'second'));
 verifyCleanBuilds(first,second);
 // Installation is mandatory, even when current inputs differ from the frozen
 // release. Its own complete bytes, assets and exported API must remain intact.
 const installed=await verifyPackage('node_modules/@documentdrivendx/umf-schema-browser');
 const git=(args:string[])=>{const result=Bun.spawnSync(['git',...args]);if(result.exitCode!==0)throw Error('Cannot establish producer checkout identity');return result.stdout.toString().trim();};
 const parity=releaseParity(first,installed,{revision:git(['rev-parse','HEAD']),clean:git(['status','--porcelain','--untracked-files=all'])===''},args.includes('--release-parity'));
 console.log('Installed schema-browser release complete payload, assets and exported API integrity verified.');
 console.log(parity.compared?'Exact producer inputs: complete published-release parity verified.':'Published-release parity unqualified for this candidate: '+parity.reasons.join('; ')+'. No release parity claim is made.');
 console.log('Two clean schema-browser builds have identical complete SHA-256 manifests.');
}finally{await rm(root,{recursive:true,force:true});}
