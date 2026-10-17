import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const directories=['docs/helix/05-deploy/microsite/dist/actions','docs/helix/05-deploy/microsite/dist/reference'];
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
export function buildKey(config:any,keys:any):string {
 const id=config.keys?.build?.key_id,human=config.keys?.human?.key_id??config.issuer?.key_id;
 if(typeof id!=='string'||id===human||!keys.keys?.some((key:any)=>key.key_id===id&&key.role==='build'&&!key.revoked_at))throw Error('GENERATED_SEAL_KEY requires a distinct registered build key');
 return id;
}
export function checkGeneratedClaim(bytes:Uint8Array,claim:any,keyId:string,colophon:any):void {
 if(claim.payload?.subjects?.length!==1||claim.payload.subjects[0].digest?.alg!=='sha256'||claim.payload.subjects[0].digest.value!==createHash('sha256').update(bytes).digest('hex'))throw Error('GENERATED_SEAL_DIGEST content changed');
 if(claim.payload?.issuer?.key_id!==keyId||claim.signatures?.length!==1||claim.signatures[0].key_id!==keyId)throw Error('GENERATED_SEAL_ROLE expected build signer');
 if(claim.payload?.colophon?.composition!=='model-primary'||JSON.stringify(claim.payload.colophon)!==JSON.stringify(colophon))throw Error('GENERATED_SEAL_COMPOSITION expected generated colophon');
}
export function checkCuratedClaim(claim:any,humanKeyId:string):void {
 if(!['mixed','human-authored'].includes(claim.payload?.colophon?.composition)||claim.payload?.issuer?.key_id!==humanKeyId||claim.signatures?.length!==1||claim.signatures[0].key_id!==humanKeyId)throw Error('CURATED_SEAL_ROLE requires the human signer for mixed/human-authored content');
}
export function checkInventory(declared:unknown,actual:string[]):asserts declared is string[] {
 if(!Array.isArray(declared)||new Set(declared).size!==declared.length||declared.some(path=>typeof path!=='string'||!directories.some(dir=>path.startsWith(dir+'/')&&/^[a-z-]+\.html$/.test(path.slice(dir.length+1))))||JSON.stringify([...declared].sort())!==JSON.stringify([...actual].sort()))throw Error('GENERATED_SEAL_INVENTORY generated page membership changed');
}
export async function run(args:string[],root=process.cwd()):Promise<void> {
 const mode=args[0];if(!['--check','--seal','--verify-curated'].includes(mode!)||args.slice(1).length&&!(args.length===3&&args[1]==='--innsigle'))throw Error('GENERATED_SEAL_ARGUMENT expected --check, --seal or --verify-curated [--innsigle path]');
 const config=await json(resolve(root,'.innsigle/config.json')),keys=await json(resolve(root,'.innsigle/public/keys.json')),policy=await json(resolve(root,'.innsigle/generated-pages.json')),colophon=await json(resolve(root,'.innsigle/generated-colo.json'));
 const keyId=buildKey(config,keys);
 if(policy.profile!=='umf.generated-page-seals/1'||colophon.composition!=='model-primary')throw Error('GENERATED_SEAL_POLICY invalid generated profile');
 const actual=(await Promise.all(directories.map(async dir=>(await readdir(resolve(root,dir))).filter(file=>file.endsWith('.html')).map(file=>dir+'/'+file)))).flat();
 checkInventory(policy.files,actual);
 const cli=resolve(root,args[2]??'.tools/innsigle/src/cli.mjs');
 const claimPath=(file:string)=>resolve(root,'.innsigle/public/claims',file.slice('docs/helix/05-deploy/microsite/dist/'.length).replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'')+'.attestation.json');
 if(mode==='--verify-curated'){
  const files=new Set<string>();
  for(const pattern of config.content_globs)for await(const file of new Bun.Glob(pattern).scan({cwd:root,onlyFiles:true}))files.add(file);
  if(policy.files.some((file:string)=>!files.has(file)))throw Error('GENERATED_SEAL_POLICY generated files must remain in the verifier inventory');
  const curated=[...files].filter(file=>!policy.files.includes(file));if(!curated.length)throw Error('CURATED_SEAL_INVENTORY no curated pages');
  for(const file of curated){
   checkCuratedClaim(await json(claimPath(file)),config.keys?.human?.key_id??config.issuer.key_id);
   const child=Bun.spawn(['node',cli,'verify',file],{cwd:root,stdout:'inherit',stderr:'inherit'});
   if(await child.exited!==0)throw Error('CURATED_SEAL_FAILED '+file);
  }
  console.log(JSON.stringify({curatedPages:curated.length,signerRole:'human',mode}));return;
 }
 if(mode==='--seal'){
  if(!process.env.INNSIGLE_BUILD_KEY)throw Error('GENERATED_SEAL_KEY INNSIGLE_BUILD_KEY is required; no human-key fallback');
  for(const file of policy.files){
   const child=Bun.spawn(['node',cli,'seal',file,'--role','build','--colo','.innsigle/generated-colo.json','--force'],{cwd:root,stdout:'inherit',stderr:'inherit'});
   if(await child.exited!==0)throw Error('GENERATED_SEAL_FAILED '+file);
  }
 }
 for(const file of policy.files){
  checkGeneratedClaim(await readFile(resolve(root,file)),await json(claimPath(file)),keyId,colophon);
 }
 console.log(JSON.stringify({generatedPages:policy.files.length,signerRole:'build',mode}));
}
if(import.meta.main)await run(process.argv.slice(2));
