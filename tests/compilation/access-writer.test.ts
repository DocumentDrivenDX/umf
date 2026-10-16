import {afterEach,expect,test} from 'bun:test';
import {mkdtemp,readFile,readdir,writeFile,rm,symlink,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {writeAccessPackage,checkAccessPackage} from '../../scripts/umf-access-generate';
// Explicit files-as-data fixture: does not qualify the source generator.
function generateAccessPackage(){const path='shop/models.py',text='fixture models\n';const digest=(s:string)=>createHash('sha256').update(s).digest('hex');const manifest=JSON.stringify({inventory:[{path,sha256:digest(text)}]});return {outcome:'candidate' as const,files:[{path,text,sha256:digest(text)},{path:'shop/_umf/manifest.json',text:manifest,sha256:digest(manifest)}]};}
const roots:string[]=[];
afterEach(async()=>{for(const p of roots.splice(0))await rm(p,{recursive:true,force:true});});
async function setup(){const root=await mkdtemp(join(await realpath(tmpdir()),'umf-access-'));roots.push(root);const destination=join(root,'output'),r=generateAccessPackage();await writeAccessPackage(destination,r);return {root,destination,r};}
async function snapshot(root:string):Promise<Record<string,string>>{const out:Record<string,string>={};async function walk(path:string,relative=''){for(const entry of await readdir(path,{withFileTypes:true})){const next=join(path,entry.name),key=relative+entry.name;if(entry.isDirectory())await walk(next,key+'/');else out[key]=await readFile(next,'hex');}}await walk(root);return out;}
// @covers US-080-AC5
 test('writer_refuses_changed_output: edited, added and removed inventory',async()=>{
 for(const change of ['edit','add','remove']){const {destination,r}=await setup(),p=join(destination,'shop/models.py');if(change==='remove')await rm(p);else await writeFile(change==='add'?join(destination,'unexpected.py'):p,'hand-written\n');const before=await snapshot(destination);await expect(writeAccessPackage(destination,r)).rejects.toMatchObject({code:'OUTPUT_CHANGED'});expect(await snapshot(destination)).toEqual(before);}
 });
// @covers US-080-AC5
 test('writer refuses symlinks without reading outside output',async()=>{
 const {root,destination,r}=await setup();await writeFile(join(root,'secret'),'sensitive');await symlink(join(root,'secret'),join(destination,'extra'));await expect(writeAccessPackage(destination,r)).rejects.toMatchObject({code:'OUTPUT_CHANGED'});expect(await readFile(join(root,'secret'),'utf8')).toBe('sensitive');
 });
// @covers US-080-AC5
 test('writer fault injection preserves pre-swap tree and reports post-swap state',async()=>{
 const {destination,r}=await setup(),before=await snapshot(destination);
 await expect(writeAccessPackage(destination,r,{fault:stage=>{if(stage==='before-swap')throw Error('injected');}})).rejects.toMatchObject({code:'WRITE_FAILED',written:false});expect(await snapshot(destination)).toEqual(before);
 await expect(writeAccessPackage(destination,r,{fault:stage=>{if(stage==='after-swap')throw Error('injected');}})).rejects.toMatchObject({code:'WRITE_FAILED',written:true});expect(await snapshot(destination)).toEqual(before);
 });
// @covers US-080-AC5
// @covers US-080-AC6
 test('stage-two files survive regeneration and are excluded exactly',async()=>{
 const {destination,r}=await setup();await mkdir(join(destination,'shop/_umf'),{recursive:true});
 for(const p of ['shop/queries.py','shop/_umf/catalog.json','shop/_umf/catalog-manifest.json','shop/_umf/privileges.json'])await writeFile(join(destination,p),'stage-two owned\n');
 expect(await checkAccessPackage(destination,r)).toEqual([]);await writeAccessPackage(destination,r);
 for(const p of ['shop/queries.py','shop/_umf/catalog.json','shop/_umf/catalog-manifest.json','shop/_umf/privileges.json'])expect(await readFile(join(destination,p),'utf8')).toBe('stage-two owned\n');
 await writeFile(join(destination,'shop/_umf/catalog-extra.json'),'not reserved');expect(await checkAccessPackage(destination,r)).toContain('shop/_umf/catalog-extra.json');
 });
// @covers US-080-AC6
 test('ci_drift_check names each differing path',async()=>{
 const {destination,r}=await setup();expect(await checkAccessPackage(destination,r)).toEqual([]);await writeFile(join(destination,'shop/models.py'),'changed\n');expect(await checkAccessPackage(destination,r)).toEqual(['shop/models.py']);
 });

// @covers US-080-AC5
 test('unsafe candidate paths and digests refuse before writing',async()=>{
 const {destination,r}=await setup(),before=await snapshot(destination);
 for(const path of ['../escape','/escape','shop/../escape','shop//escape','shop\\escape','C:/escape']){const bad={...r,files:[{...r.files[0]!,path}]};await expect(writeAccessPackage(destination,bad)).rejects.toMatchObject({code:'INVALID_CANDIDATE'});expect(await snapshot(destination)).toEqual(before);}
 await expect(writeAccessPackage(destination,{outcome:'refused',files:[]})).rejects.toMatchObject({code:'INVALID_CANDIDATE'});
 await expect(writeAccessPackage(destination,{...r,files:r.files.map(f=>({...f,sha256:'0'.repeat(64)}))})).rejects.toMatchObject({code:'INVALID_CANDIDATE'});
 });
 test('check reports missing and extra bytes without modifying output',async()=>{const {destination,r}=await setup();await rm(join(destination,'shop/models.py'));await writeFile(join(destination,'shop/extra'),'extra');const before=await snapshot(destination);expect(await checkAccessPackage(destination,r)).toEqual(['shop/extra','shop/models.py']);expect(await snapshot(destination)).toEqual(before);});

 test('rename boundary failures restore the original package',async()=>{for(const boundary of ['before-backup-rename','before-install-rename']){const {destination,r}=await setup(),before=await snapshot(destination);await expect(writeAccessPackage(destination,r,{fault:stage=>{if(stage===boundary)throw Error('injected rename failure');}})).rejects.toMatchObject({code:'WRITE_FAILED',written:false});expect(await snapshot(destination)).toEqual(before);}});
 test('reserved symlinks and destination symlinks refuse',async()=>{const {root,destination,r}=await setup();await writeFile(join(root,'outside'),'outside');await symlink(join(root,'outside'),join(destination,'shop/queries.py'));await expect(writeAccessPackage(destination,r)).rejects.toMatchObject({code:'OUTPUT_CHANGED'});await expect(checkAccessPackage(destination,r)).rejects.toMatchObject({code:'OUTPUT_CHANGED'});const alias=join(root,'alias');await symlink(destination,alias);await expect(writeAccessPackage(alias,r)).rejects.toMatchObject({code:'OUTPUT_CHANGED'});});

 test('empty existing output refuses after complete inventory removal',async()=>{const {destination,r}=await setup();await rm(join(destination,'shop'),{recursive:true});await expect(writeAccessPackage(destination,r)).rejects.toMatchObject({code:'OUTPUT_CHANGED'});expect(await snapshot(destination)).toEqual({});});

 test('explicit CLI uses real generator, checks byte drift and refuses without writes',async()=>{
 const {profile,request}=await import('./access-fixtures');
 const root=await mkdtemp(join(await realpath(tmpdir()),'umf-access-cli-'));roots.push(root);
 const req=join(root,'request.json'),prof=join(root,'profile.json'),output=join(root,'output');
 await writeFile(req,JSON.stringify(request()));await writeFile(prof,JSON.stringify(profile()));
 async function run(args:string[]){const child=Bun.spawn([process.execPath,join(import.meta.dir,'../../scripts/umf-access-generate.ts'),...args],{stdout:'pipe',stderr:'pipe'});const [exit,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);return {exit,out,err};}
 const args=['--request',req,'--profile',prof,'--output',output];
 expect((await run(['generate',...args])).exit).toBe(0);
 expect((await run(['check',...args])).exit).toBe(0);
 await writeFile(join(output,'shop/models.py'),'edited');const before=await snapshot(output);
 const drift=await run(['check',...args]);expect(drift.exit).not.toBe(0);expect(drift.out).toContain('shop/models.py');expect(await snapshot(output)).toEqual(before);
 const changed=await run(['generate',...args]);expect(changed.exit).not.toBe(0);expect(changed.err).toContain('OUTPUT_CHANGED');expect(await snapshot(output)).toEqual(before);
 await writeFile(req,JSON.stringify({...request(),package:'../unsafe'}));const refused=await run(['generate',...args]);expect(refused.exit).not.toBe(0);expect(await snapshot(output)).toEqual(before);
 expect((await run(['generate',...args,'--unknown','x'])).exit).not.toBe(0);
 await writeFile(req,JSON.stringify(request()));await writeFile(prof,JSON.stringify({...profile(),coreVersions:[]}));const refusedCandidate=await run(['generate',...args]);expect(refusedCandidate.exit).not.toBe(0);expect(refusedCandidate.err).toContain('GENERATION_REFUSED');expect(await snapshot(output)).toEqual(before);
 },60000);
