// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,readFile,symlink,chmod,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {rm} from 'node:fs/promises';
import {assetPath,assetUrl,parseLock,loadLock,select,seedAsset,resolveAsset,resolveSelection,materialize,type Asset,type AssetLock} from '../scripts/assets/store';
const sha=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const revision='a'.repeat(40),body='original\r\n';
function asset(extra:Partial<Asset>={}):Asset{return {id:'pack/document',path:'pack/document.txt',bytes:Buffer.byteLength(body),sha256:sha(body),sourceId:'original',rights:'unknown',mediaType:'text/plain',url:'https://example.org/data',...extra};}
function lock(assets=[asset()]):AssetLock{return parseLock({version:1,kind:'conformance',id:'suite',revision,allowedHosts:['example.org'],assets,selections:{native:{assets:assets.map(a=>a.id),entrypoint:assets[0]!.path,caseIds:['positive','negative']}}});}
async function fixture(run:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'umf-asset-test-'));try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}
function transport(response:()=>Response){let calls=0;return {get calls(){return calls;},fetcher:(async()=>{calls++;return response();}) as unknown as typeof fetch};}
const response=(value=body,extra:Record<string,string>={})=>new Response(value,{headers:{'content-type':'text/plain','content-length':String(Buffer.byteLength(value)),...extra}});

test('trusted lock digest is checked before parsing, revision and complete selectors before resolution',()=>fixture(async root=>{
 const path=join(root,'lock.json');await writeFile(path,JSON.stringify(lock()));
 await expect(loadLock(path,'0'.repeat(64))).rejects.toThrow('lock checksum');
 const parsed=await loadLock(path,sha(await readFile(path)));expect(parsed.revision).toBe(revision);
 expect(()=>select(parsed,['native'],'b'.repeat(40))).toThrow('revision');
 expect(()=>select(parsed,['native','missing'],revision)).toThrow('missing selector');
 expect(()=>select(parsed,[],revision)).toThrow('selectors');
 const t=transport(()=>response());await expect(resolveSelection(parsed,['missing'],revision,{cache:join(root,'cache'),download:true,rights:'local-use',fetcher:t.fetcher})).rejects.toThrow('selector');expect(t.calls).toBe(0);
}));
test('lock rejects unsafe paths, file/directory aliases, missing case inventories and duplicate identities',()=>{
 for(const path of ['/absolute','../outside','a/../b','a//b','a\\b','C:/a','a\0b'])expect(()=>assetPath(path)).toThrow('unsafe');
 expect(()=>lock([asset(),asset({id:'other'})])).toThrow('duplicate');
 expect(()=>lock([asset({path:'a'}),asset({id:'nested',path:'a/b'})])).toThrow('collision');
 const value=JSON.parse(JSON.stringify(lock()));delete value.selections.native.caseIds;expect(()=>parseLock(value)).toThrow('case inventory');
 for(const url of ['http://example.org/a','https://127.0.0.1/a','https://example.org@localhost/a','https://example.org:8443/a','https://example.org/a#part','https://other.org/a'])expect(()=>assetUrl(url,['example.org'])).toThrow();
});
test('explicit local seeding preserves original bytes and verified offline cache resolves a complete cohort',()=>fixture(async root=>{
 const src=join(root,'source'),cache=join(root,'cache');await mkdir(join(src,'pack'),{recursive:true});await writeFile(join(src,'pack/document.txt'),body);
 await seedAsset(asset(),src,cache);
 const result=await resolveSelection(lock(),['native'],revision,{cache});expect(await readFile(result.paths['pack/document.txt']!,'utf8')).toBe(body);
 const out=join(root,'workspace');const ready=await materialize(lock(),['native'],revision,{cache},out);expect(await readFile(join(ready.root,'pack/document.txt'),'utf8')).toBe(body);
}));
test('offline miss and undeclared exact URL never fetch implicitly',()=>fixture(async root=>{
 const t=transport(()=>response()),cache=join(root,'cache');
 await expect(resolveAsset(lock(),asset(),{cache,fetcher:t.fetcher})).rejects.toThrow('offline asset missing');
 await expect(resolveAsset(lock(),asset({url:undefined} as any),{cache,download:true,rights:'local-use',fetcher:t.fetcher})).rejects.toThrow('no exact-byte download');expect(t.calls).toBe(0);
}));
test('cold acquisition validates exact bytes and cache hits do not fetch again',()=>fixture(async root=>{
 const t=transport(()=>response()),options={cache:join(root,'cache'),download:true,rights:'local-use' as const,fetcher:t.fetcher};
 const path=await resolveAsset(lock(),asset(),options);expect(await readFile(path,'utf8')).toBe(body);
 expect(await resolveAsset(lock(),asset(),options)).toBe(path);expect(t.calls).toBe(1);
}));
test('bad or modified cache refuses rather than downloading a replacement',()=>fixture(async root=>{
 const t=transport(()=>response()),options={cache:join(root,'cache'),download:true,rights:'local-use' as const,fetcher:t.fetcher};
 const path=await resolveAsset(lock(),asset(),options);await chmod(path,0o644);await writeFile(path,'modified!!');
 await expect(resolveAsset(lock(),asset(),options)).rejects.toThrow('checksum');expect(t.calls).toBe(1);
}));
test('wrong HTTP hash, size, media and redirects leave no published or partial cache file',()=>fixture(async root=>{
 const cases=[()=>response('incorrect!'),()=>response(body+'extra'),()=>response(body,{'content-type':'text/html'}),()=>new Response('',{status:302,headers:{location:'https://other.org/'}})];
 for(let i=0;i<cases.length;i++){
  const cache=join(root,String(i)),t=transport(cases[i]!);
  await expect(resolveAsset(lock(),asset(),{cache,download:true,rights:'local-use',fetcher:t.fetcher})).rejects.toThrow();
  expect(await readdir(join(cache,'sha256',asset().sha256.slice(0,2)))).toEqual([]);
 }
}));
test('interrupted body and oversize streamed body cannot become cache hits',()=>fixture(async root=>{
 for(const variant of ['interrupted','oversize']){
  const t=transport(()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(variant==='oversize'?body+'extra':'part'));if(variant==='interrupted')c.error(Error('interrupted'));else c.close();}}),{headers:{'content-type':'text/plain'}}));
  const cache=join(root,variant);await expect(resolveAsset(lock(),asset(),{cache,download:true,rights:'local-use',fetcher:t.fetcher})).rejects.toThrow();
  expect(await readdir(join(cache,'sha256',asset().sha256.slice(0,2)))).toEqual([]);
 }
}));
test('source, cache and output symlinks are rejected without following them',()=>fixture(async root=>{
 const src=join(root,'src'),outside=join(root,'outside'),cache=join(root,'cache');await mkdir(src);await mkdir(outside);await writeFile(join(outside,'document.txt'),body);await symlink(outside,join(src,'pack'));
 await expect(seedAsset(asset(),src,cache)).rejects.toThrow('unsafe');
 await mkdir(join(cache,'sha256'),{recursive:true});await symlink(outside,join(cache,'sha256',asset().sha256.slice(0,2)));
 await expect(resolveAsset(lock(),asset(),{cache})).rejects.toThrow('unsafe');
 const other=join(root,'good-cache');await seedAsset(asset({path:'document.txt'}),outside,other);
 const out=join(root,'output');await mkdir(out);await symlink(outside,join(out,'pack'));
 await expect(materialize(lock(),['native'],revision,{cache:other},out)).rejects.toThrow('unsafe');expect(await readFile(join(outside,'document.txt'),'utf8')).toBe(body);
}));
test('materialization verifies the whole cohort before exposing runnable output and preserves modified destinations',()=>fixture(async root=>{
 const cache=join(root,'cache'),t=transport(()=>response()),first=asset();await resolveAsset(lock(),first,{cache,download:true,rights:'local-use',fetcher:t.fetcher});
 const second=asset({id:'second',path:'second.txt',sha256:sha('missing'),bytes:7}),cohort=lock([first,second]);
 const out=join(root,'output');await expect(materialize(cohort,['native'],revision,{cache},out)).rejects.toThrow('offline');
 expect(await Bun.file(join(out,first.path)).exists()).toBe(false);
 await mkdir(join(out,'pack'),{recursive:true});await writeFile(join(out,first.path),'user edit');
 await expect(materialize(lock(),['native'],revision,{cache},out)).rejects.toThrow();expect(await readFile(join(out,first.path),'utf8')).toBe('user edit');
}));
test('explicit rights and redistribution checks run before a network request',()=>fixture(async root=>{
 const cache=join(root,'cache'),t=transport(()=>response());
 await expect(resolveAsset(lock(),asset(),{cache,download:true,fetcher:t.fetcher})).rejects.toThrow('rights');
 await expect(resolveAsset(lock(),asset(),{cache,download:true,rights:'redistribute',fetcher:t.fetcher})).rejects.toThrow('rights');expect(t.calls).toBe(0);
}));
test('concurrent verified downloads share one immutable cache object',()=>fixture(async root=>{
 const t=transport(()=>response()),options={cache:join(root,'cache'),download:true,rights:'local-use' as const,fetcher:t.fetcher};
 const paths=await Promise.all([resolveAsset(lock(),asset(),options),resolveAsset(lock(),asset(),options)]);expect(paths[0]).toBe(paths[1]);expect(await readFile(paths[0]!,'utf8')).toBe(body);
 expect((await readdir(join(options.cache,'sha256',asset().sha256.slice(0,2)))).length).toBe(1);
}));

test('CLI requires explicit source pin for conformance and refuses unknown selectors before creating output',()=>fixture(async root=>{
 const path=join(root,'cohort.json');await writeFile(path,JSON.stringify(lock()));
 const cli=join(import.meta.dir,'../scripts/conformance-resolve.ts');
 async function run(args:string[]){const p=Bun.spawn(['bun',cli,...args],{stdout:'pipe',stderr:'pipe'});const error=await new Response(p.stderr).text();return {code:await p.exited,error};}
 const common=['--lock',path,'--selector','native','--cache',join(root,'cache')];
 const unpinned=await run(common);expect(unpinned.code).not.toBe(0);expect(unpinned.error).toContain('SHA-256 and exact revision');
 const unknown=await run(['--lock',path,'--lock-sha256',sha(await readFile(path)),'--revision',revision,'--selector','missing','--cache',join(root,'cache'),'--output',join(root,'output')]);
 expect(unknown.code).not.toBe(0);expect(unknown.error).toContain('missing selector');expect(await Bun.file(join(root,'output/pack/document.txt')).exists()).toBe(false);
}));
test('source lock builder rejects absent files and refuses to replace reviewed locks',()=>fixture(async root=>{
 const repo=join(import.meta.dir,'..'),output=join(root,'lock.json'),selection=join(root,'selection.json');
 const head=Bun.spawn(['git','rev-parse','HEAD'],{cwd:repo,stdout:'pipe'});const rev=(await new Response(head.stdout).text()).trim();expect(await head.exited).toBe(0);
 async function run(){const p=Bun.spawn(['python3','scripts/assets/build-conformance-lock.py','--root',repo,'--revision',rev,'--selection',selection,'--output',output],{cwd:repo,stdout:'pipe',stderr:'pipe'});const error=await new Response(p.stderr).text();return {code:await p.exited,error};}
 await writeFile(selection,JSON.stringify({id:'packet',selections:{one:{paths:['does-not-exist'],caseIds:['integrity']}}}));expect((await run()).code).not.toBe(0);
 await writeFile(selection,JSON.stringify({id:'packet',selections:{one:{paths:['fixtures/metamodel/current-conformance.json'],caseIds:['resource-integrity']}}}));expect((await run()).code).toBe(0);
 const original=await readFile(output);expect((await run()).code).not.toBe(0);expect(await readFile(output)).toEqual(original);
 const parsed=await loadLock(output,sha(original));expect(parsed.revision).toBe(rev);expect(parsed.selections.one!.caseIds).toEqual(['resource-integrity']);
}),30_000);

test('checked pack lock protects complete composed families and does not download transformed projections',async()=>{
 const {packLockSha256}=await import('../scripts/assets/pack-lock-pin');
 const packs=await loadLock(join(import.meta.dir,'../scripts/assets/domain-packs.lock.json'),packLockSha256);
 expect(packs.assets.length).toBe(789);
 const medical=select(packs,['medical'],packs.revision);
 for(const id of ['medical-carrier','medical-epidemiology','medical-imaging','medical-terminology'])expect(medical.some(a=>a.path===`spec/domain-packs/${id}/pack.json`)).toBe(true);
 expect(packs.assets.find(a=>a.id==='public-company-intelligence/data/financial_observations.csv')?.url).toBeUndefined();
 expect(packs.assets.some(a=>a.id.startsWith('legal-appellate/sources/')&&a.url)).toBe(true);
});


test('offline materialization preserves executable source mode and refuses a changed mode',()=>fixture(async root=>{
 const original=asset({mode:'100755'}),cohort=lock([original]),t=transport(()=>response()),cache=join(root,'cache');
 await resolveAsset(cohort,original,{cache,download:true,rights:'local-use',fetcher:t.fetcher});
 const first=await materialize(cohort,['native'],revision,{cache},join(root,'out'));
 const path=first.paths[original.path]!;expect((await import('node:fs/promises').then(m=>m.stat(path))).mode&0o111).toBe(0o111);
 await chmod(path,0o644);await expect(materialize(cohort,['native'],revision,{cache},join(root,'out'))).rejects.toThrow('mode mismatch');
}));
