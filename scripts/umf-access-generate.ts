/** Host-only filesystem boundary. Paths in result.files include the package prefix;
 * destination is the fixed output parent containing that package. */
import {createHash} from 'node:crypto';
import {generateAccessPackage} from '../src/compilation/index';
import {lstat,readdir,readFile,mkdir,mkdtemp,writeFile,rename,rm} from 'node:fs/promises';
import {resolve,dirname,join,parse} from 'node:path';
export interface AccessPackageData {outcome:'candidate'|'refused';files:readonly {path:string;text:string;sha256:string}[]}
export interface WriterOptions {fault?:(stage:'before-swap'|'before-backup-rename'|'before-install-rename'|'after-swap')=>void|Promise<void>}
function failure(code:string,message:string,written=false){return Object.assign(new Error(message),{code,written});}
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
function safe(path:string){return path.length>0&&!path.includes('\\')&&!path.includes('\0')&&!path.split('/').some(x=>!x||x==='.'||x==='..')&&!path.startsWith('/')&&!/^[A-Za-z]:/.test(path);}
function candidate(result:AccessPackageData){
 if(result.outcome!=='candidate'||!result.files.length)throw failure('INVALID_CANDIDATE','Only nonempty candidates can be written');
 const files=new Map<string,Buffer>();let pkg:string|undefined;
 for(const f of result.files){if(!safe(f.path)||files.has(f.path)||hash(f.text)!==f.sha256)throw failure('INVALID_CANDIDATE','Invalid path, duplicate or digest: '+f.path);const prefix=f.path.split('/')[0]!;if(!pkg)pkg=prefix;if(prefix!==pkg||!f.path.includes('/'))throw failure('INVALID_CANDIDATE','Expected one package');files.set(f.path,Buffer.from(f.text));}
 const reserved=new Set([`${pkg}/queries.py`,`${pkg}/_umf/catalog.json`,`${pkg}/_umf/catalog-manifest.json`,`${pkg}/_umf/privileges.json`]);
 for(const p of reserved)if(files.has(p))throw failure('INVALID_CANDIDATE','Stage-two path: '+p);
 const manifest=`${pkg}/_umf/manifest.json`;
 const inventory=readInventory(files.get(manifest),manifest,reserved);
 if(inventory.size!==files.size-1||[...files].some(([p,b])=>p!==manifest&&inventory.get(p)!==hash(b)))throw failure('INVALID_CANDIDATE','Candidate inventory mismatch');
 return {files,reserved,manifest};
}
function readInventory(bytes:Buffer|undefined,manifest:string,reserved:Set<string>){
 if(!bytes)throw failure('OUTPUT_CHANGED','Missing manifest');
 let entries:unknown;try{entries=JSON.parse(bytes.toString()).inventory;}catch{throw failure('OUTPUT_CHANGED','Invalid manifest');}
 if(!Array.isArray(entries))throw failure('OUTPUT_CHANGED','Missing inventory');
 const out=new Map<string,string>();const pkg=manifest.split('/')[0];
 for(const e of entries){if(!e||typeof e.path!=='string'||!safe(e.path)||!e.path.startsWith(pkg+'/')||e.path===manifest||reserved.has(e.path)||out.has(e.path)||typeof e.sha256!=='string'||!/^[a-f0-9]{64}$/.test(e.sha256))throw failure('OUTPUT_CHANGED','Invalid inventory');out.set(e.path,e.sha256);}
 return out;
}
async function ancestors(path:string){let p=resolve(path);while(true){try{const st=await lstat(p);if(st.isSymbolicLink()||!st.isDirectory())throw failure('OUTPUT_CHANGED','Unsafe destination ancestor');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}const next=dirname(p);if(next===p)break;p=next;}}
async function tree(root:string):Promise<Map<string,Buffer>>{const out=new Map<string,Buffer>();try{const st=await lstat(root);if(!st.isDirectory()||st.isSymbolicLink())throw failure('OUTPUT_CHANGED','Unsafe destination');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return out;throw e;}
 async function walk(dir:string,prefix=''){for(const name of await readdir(dir)){const p=prefix+name,full=join(dir,name),st=await lstat(full);if(st.isSymbolicLink()||(!st.isFile()&&!st.isDirectory()))throw failure('OUTPUT_CHANGED','Unsafe output: '+p);if(st.isDirectory())await walk(full,p+'/');else out.set(p,await readFile(full));}}await walk(root);return out;}
export async function checkAccessPackage(destination:string,result:AccessPackageData):Promise<string[]>{const c=candidate(result);await ancestors(destination);const existing=await tree(destination);return [...new Set([...existing.keys(),...c.files.keys()])].filter(p=>!c.reserved.has(p)&&(!existing.has(p)||!c.files.has(p)||!existing.get(p)!.equals(c.files.get(p)!))).sort();}
export async function writeAccessPackage(destination:string,result:AccessPackageData,options:WriterOptions={}):Promise<{written:true}>{
 const c=candidate(result);destination=resolve(destination);if(destination===parse(destination).root)throw failure('OUTPUT_CHANGED','Cannot replace filesystem root');await ancestors(destination);
 const old=await tree(destination);
 let exists=true;try{await lstat(destination);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')exists=false;else throw e;}
 if(exists){const inventory=readInventory(old.get(c.manifest),c.manifest,c.reserved);const paths=[...old.keys()].filter(p=>!c.reserved.has(p)&&p!==c.manifest);if(paths.length!==inventory.size||paths.some(p=>inventory.get(p)!==hash(old.get(p)!)))throw failure('OUTPUT_CHANGED','Existing output differs from inventory');}
 // Existing directories require a valid previous manifest, even if emptied.
 await mkdir(dirname(destination),{recursive:true});const staging=await mkdtemp(join(dirname(destination),'.umf-access-'));const next=join(staging,'next'),backup=join(staging,'previous');let moved=false,written=false;
 try{await mkdir(next);for(const [p,bytes] of [...c.files,...[...old].filter(([p])=>c.reserved.has(p))]){await mkdir(dirname(join(next,p)),{recursive:true});await writeFile(join(next,p),bytes);}
 await options.fault?.('before-swap');
 // Recheck immediately before the renames, including symlink refusal.
 const current=await tree(destination);if(current.size!==old.size||[...old].some(([p,b])=>!current.get(p)?.equals(b)))throw failure('OUTPUT_CHANGED','Output changed while staging');
 try{await options.fault?.('before-backup-rename');await rename(destination,backup);moved=true;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 try{await options.fault?.('before-install-rename');await rename(next,destination);written=true;}catch(e){if(moved){await rename(backup,destination);moved=false;}throw e;}
 await options.fault?.('after-swap');return {written:true};
 }catch(e){if((e as {code?:string}).code==='OUTPUT_CHANGED'&&!written)throw e;throw failure('WRITE_FAILED',e instanceof Error?e.message:String(e),written);}finally{if(!moved||written)await rm(staging,{recursive:true,force:true}).catch(()=>{});}
}

/** Explicit host CLI. Profile JSON is inert metadata for installed generator code. */
export async function runAccessCli(args:readonly string[]):Promise<number>{
 try{
 const [command,...rest]=args;
 if(command!=='generate'&&command!=='check')throw failure('USAGE','Expected generate|check --request <JSON file> --profile <JSON file> --output <directory>');
 const flags=new Map<string,string>();
 for(let i=0;i<rest.length;i+=2){const key=rest[i]!,value=rest[i+1];if(!['--request','--profile','--output'].includes(key)||flags.has(key)||!value||value.startsWith('--'))throw failure('USAGE','Invalid or duplicate CLI argument: '+key);flags.set(key,value);}
 if(flags.size!==3)throw failure('USAGE','Required: --request, --profile, --output');
 // Only these caller-selected files are read. Document metadata never selects imports.
 const request=JSON.parse(await readFile(flags.get('--request')!,'utf8'));
 const profile=JSON.parse(await readFile(flags.get('--profile')!,'utf8'));
 const result=generateAccessPackage(request,profile);
 if(result.outcome!=='candidate'){console.error(JSON.stringify({code:'GENERATION_REFUSED',diagnostics:result.diagnostics}));return 1;}
 if(command==='check'){const paths=await checkAccessPackage(flags.get('--output')!,result);for(const path of paths)console.log(path);return paths.length?1:0;}
 await writeAccessPackage(flags.get('--output')!,result);return 0;
 }catch(e){const error=e as {code?:string;message?:string;written?:boolean};console.error(JSON.stringify({code:error.code??'CLI_FAILED',message:error.message??String(e),...(error.written===undefined?{}:{written:error.written})}));return 1;}
}
if(import.meta.main)process.exitCode=await runAccessCli(process.argv.slice(2));
