import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const directories=['docs/helix/05-deploy/microsite/dist','docs/helix/05-deploy/microsite/dist/actions','docs/helix/05-deploy/microsite/dist/reference'];
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
export function buildKey(config:any,keys:any):string {
 const id=config.keys?.build?.key_id;
 if(typeof id!=='string'||config.issuer?.key_id!==id||!keys.keys?.some((key:any)=>key.key_id===id&&key.role==='build'&&!key.revoked_at))throw Error('GENERATED_SEAL_KEY requires the registered build signer');
 if(config.onepassword||config.signing_key||Object.keys(config.keys??{}).some(role=>role!=='build')||Object.keys(config.keys?.build??{}).some(key=>key!=='key_id'))throw Error('GENERATED_SEAL_KEY only the build environment key is permitted');
 return id;
}
export function checkGeneratedClaim(bytes:Uint8Array,claim:any,keyId:string,colophon:any):void {
 if(claim.payload?.subjects?.length!==1||claim.payload.subjects[0].digest?.alg!=='sha256'||claim.payload.subjects[0].digest.value!==createHash('sha256').update(bytes).digest('hex'))throw Error('GENERATED_SEAL_DIGEST content changed');
 if(claim.payload?.issuer?.key_id!==keyId||claim.signatures?.length!==1||claim.signatures[0].key_id!==keyId)throw Error('GENERATED_SEAL_ROLE expected build signer');
 if(claim.payload?.colophon?.composition!=='model-primary'||JSON.stringify(claim.payload.colophon)!==JSON.stringify(colophon))throw Error('GENERATED_SEAL_COMPOSITION expected generated colophon');
}
export function checkInventory(declared:unknown,actual:string[]):asserts declared is string[] {
 if(!Array.isArray(declared)||!declared.length||new Set(declared).size!==declared.length||declared.some(path=>typeof path!=='string'||!directories.some(dir=>path.startsWith(dir+'/')&&/^[a-z0-9-]+\.html$/.test(path.slice(dir.length+1))))||JSON.stringify([...declared].sort())!==JSON.stringify([...actual].sort()))throw Error('GENERATED_SEAL_INVENTORY generated page membership changed');
}
export async function run(args:string[],root=process.cwd()):Promise<void> {
 const mode=args[0];if(!['--inventory','--check','--seal'].includes(mode!)||args.slice(1).length&&!(args.length===3&&args[1]==='--innsigle'))throw Error('GENERATED_SEAL_ARGUMENT expected --inventory, --check or --seal [--innsigle path]');
 const config=await json(resolve(root,'.innsigle/config.json')),keys=await json(resolve(root,'.innsigle/public/keys.json')),policy=await json(resolve(root,'.innsigle/generated-pages.json')),colophon=await json(resolve(root,'.innsigle/generated-colo.json'));
 const keyId=buildKey(config,keys);
 if(policy.profile!=='umf.generated-page-seals/1'||colophon.composition!=='model-primary')throw Error('GENERATED_SEAL_POLICY invalid generated profile');
 const actual=(await Promise.all(directories.map(async dir=>(await readdir(resolve(root,dir))).filter(file=>file.endsWith('.html')).map(file=>dir+'/'+file)))).flat();
 checkInventory(policy.files,actual);
 const cli=resolve(root,args[2]??'.tools/innsigle/src/cli.mjs');
 const claimPath=(file:string)=>resolve(root,'.innsigle/public/claims',file.slice('docs/helix/05-deploy/microsite/dist/'.length).replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'')+'.attestation.json');
 const configured=new Set<string>();for(const pattern of config.content_globs??[])for await(const file of new Bun.Glob(pattern).scan({cwd:root,onlyFiles:true}))configured.add(file);
 checkInventory([...configured],actual);
 if(config.default_composition!=='model-primary'||config.kind_from_frontmatter!==false)throw Error('GENERATED_SEAL_POLICY all site pages must be model-primary');
 if(mode==='--inventory'){console.log(JSON.stringify({sitePages:actual.length,signerRole:'build',mode}));return;}
 if(mode==='--seal'){
  if(!process.env.INNSIGLE_BUILD_KEY)throw Error('GENERATED_SEAL_KEY INNSIGLE_BUILD_KEY is required; no interactive signing fallback');
  for(const file of policy.files){
   const child=Bun.spawn(['node',cli,'seal',file,'--role','build','--colo','.innsigle/generated-colo.json','--force'],{cwd:root,stdout:'inherit',stderr:'inherit'});
   if(await child.exited!==0)throw Error('GENERATED_SEAL_FAILED '+file);
  }
  // Verification resolves the hosted well-known claims; sync before verifying.
  const published=Bun.spawn(['node',cli,'publish',config.content_root],{cwd:root,stdout:'inherit',stderr:'inherit'});
  if(await published.exited!==0)throw Error('GENERATED_SEAL_PUBLISH public claims were not copied');
 }
 for(const file of policy.files){
  checkGeneratedClaim(await readFile(resolve(root,file)),await json(claimPath(file)),keyId,colophon);
 }
 console.log(JSON.stringify({generatedPages:policy.files.length,signerRole:'build',mode}));
}
if(import.meta.main)await run(process.argv.slice(2));
