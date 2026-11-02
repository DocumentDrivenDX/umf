// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {checkGeneratedClaim} from '../generated-page-seals';
const repo=resolve(import.meta.dir,'../..'),site=join(repo,'docs/helix/05-deploy/microsite/dist');
const origin=process.argv[2]??'https://documentdrivendx.github.io/umf/';
const verifier=process.argv[3];if(!verifier)throw Error('Pass the public site URL and trusted Innsigle CLI path.');
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function download(path:string){const response=await fetch(new URL(path,origin),{headers:{'cache-control':'no-cache'},redirect:'error'});if(!response.ok)throw Error(`${path}: HTTP ${response.status}`);return new Uint8Array(await response.arrayBuffer());}
const expected=await Bun.file(join(site,'assets/pack-tools/provenance.json')).json();
const checks:Record<string,string>={...expected.outputs};
for(const path of ['assets/pack-tools/provenance.json','schema-catalog.json'])checks[path]=hash(new Uint8Array(await Bun.file(join(site,path)).arrayBuffer()));
for(const [path,digest]of Object.entries(checks))if(hash(await download(path))!==digest)throw Error(`Public asset differs from the locally tested bytes: ${path}`);
const html=await download('pack-tools.html'),claimBytes=await download('.well-known/innsigle/claims/pack-tools-html.attestation.json');
const claim=JSON.parse(new TextDecoder().decode(claimBytes)),config=await Bun.file(join(repo,'.innsigle/config.json')).json(),colophon=await Bun.file(join(repo,'.innsigle/generated-colo.json')).json();
checkGeneratedClaim(html,claim,config.keys.build.key_id,colophon);
const publicKeys=JSON.parse(new TextDecoder().decode(await download('.well-known/innsigle/keys.json'))),localKeys=await Bun.file(join(repo,'.innsigle/public/keys.json')).json();
const local=localKeys.keys.find((key:any)=>key.key_id===config.keys.build.key_id),published=publicKeys.keys.find((key:any)=>key.key_id===config.keys.build.key_id);
if(!local||!published||published.public_key!==local.public_key||published.role!=='build'||published.revoked_at)throw Error('Public build key differs from the registered trusted signer');
const temporary=await mkdtemp(join(tmpdir(),'umf-pack-tools-public-'));
try{
 await writeFile(join(temporary,'page.html'),html);await writeFile(join(temporary,'claim.json'),claimBytes);
 const child=Bun.spawn(['node',resolve(verifier),'verify','--attestation',join(temporary,'claim.json'),'--content',join(temporary,'page.html'),'--keys',join(repo,'.innsigle/public/keys.json')],{stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,status]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(status!==0||!stdout.startsWith('VALID'))throw Error(stderr||stdout||'Signature verification failed');
 console.log(JSON.stringify({profile:'umf.pack-tools.publication/1',url:new URL('pack-tools.html',origin).href,verifiedAssets:Object.keys(checks).length,assetSha256:checks,signedHtmlSha256:hash(html),signature:'VALID',signerRole:'build',signerKeyId:local.key_id,checkedAt:new Date().toISOString()},null,2));
}finally{await rm(temporary,{recursive:true,force:true});}
