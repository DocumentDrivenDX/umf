import {test,expect} from 'bun:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runLoader} from '../../scripts/loaders/engine';
import {readLoaderPublication} from '../../scripts/loaders/publication';
import {hash,json} from '../../scripts/loaders/state';
import {exportPack} from '../../scripts/loaders/export';
const body='{"amount":9007199254740993.0100,"future":{"meaning":"original"}}';
const entry={id:'SEC:fixture',url:'https://data.sec.gov/fixture.json',media_type:'application/json',license:{redistribution:'allowed'},metadata:{snapshot_checksum:'documentary-only'}};
const inventory=(e:any)=>JSON.stringify({version:'1.0.0',id:'fixture',allowed_hosts:['data.sec.gov'],request_interval_ms:1000,max_bytes:1024,max_total_bytes:4096,max_documents:10,timeout_ms:1000,retries:0,entries:[e]});
async function setup(fn:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'umf-loader-publication-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
test('verified bridge retains exact originals and source contexts @covers US-060-AC11 @covers US-060-AC12',async()=>setup(async root=>{
 const output=join(root,'install');await exportPack('spec/domain-packs/sec-filings-loader-demo/pack.json',output,{includeSources:true});
 const pack=await Bun.file(join(output,'domain-pack.json')).json(),packHash=hash(await readFile(join(output,'domain-pack.json'),'utf8')),state=join(root,'state');
 const options={state,pack,packHash,inventoryText:inventory(entry),mode:'backfill' as const,rights:'local-use' as const,userAgent:'Fixture contact@example.org'};
 const transport=async()=>new Response(body,{headers:{'content-type':'application/json'}});
 expect((await runLoader(options,{fetch:transport,sleep:async()=>{}})).status).toBe('complete');
 expect((await runLoader({...options,mode:'refresh',inventoryText:inventory({...entry,metadata:{context:'changed'}})},{fetch:transport,sleep:async()=>{}})).status).toBe('complete');
 const read=await readLoaderPublication(state,[{id:entry.id}]);expect(new TextDecoder().decode(read.sources[0]!.bytes)).toBe(body);expect(read.sources[0]!.row.metadata).toEqual({context:'changed'});
 const history=await readLoaderPublication(state,[{id:entry.id,revision:hash(body)}]);expect(history.sources).toHaveLength(2);history.sources[0]!.bytes[0]=0;expect(history.sources[1]!.bytes[0]).toBe(123);
 await expect(readLoaderPublication(state,[{id:'absent'}])).rejects.toThrow('UNRESOLVED');
 const selection=join(root,'selection.json');await Bun.write(selection,JSON.stringify([{id:entry.id}]));
 const cli=Bun.spawn([process.execPath,join(output,'read-publication.ts'),'--state',state,'--selection',selection,'--output',join(root,'selected')],{cwd:tmpdir(),stdout:'pipe',stderr:'pipe'});
 const [code,stdout,stderr]=await Promise.all([cli.exited,new Response(cli.stdout).text(),new Response(cli.stderr).text()]);expect({code,stderr}).toEqual({code:0,stderr:''});expect(JSON.parse(stdout).sources).toBe(1);
 const manifest=await Bun.file(join(root,'selected/selection.json')).json();expect(manifest.publication.pack_hash).toBe(packHash);expect(await readFile(join(root,'selected',manifest.sources[0].reference),'utf8')).toBe(body);
}));
test('enforced content pins are separate from documentary hashes @covers US-060-AC9 @covers US-060-AC12',async()=>setup(async root=>{
 const options={state:root,pack:{id:'test',version:'1.0.0',loader:{profile:'sec-filings'}},packHash:'a'.repeat(64),inventoryText:inventory({...entry,expected_sha256:hash(body)}),mode:'backfill' as const,rights:'local-use' as const,userAgent:'Fixture contact@example.org'};
 const transport=async()=>new Response(body,{headers:{'content-type':'application/json'}});
 expect((await runLoader(options,{fetch:transport})).status).toBe('complete');const pointer=await readFile(join(root,'current.json'),'utf8');
 const failed=await runLoader({...options,mode:'refresh'},{fetch:async()=>new Response(body+' ',{headers:{'content-type':'application/json'}})});expect(failed.items[0]?.code).toBe('SOURCE_HASH');expect(await readFile(join(root,'current.json'),'utf8')).toBe(pointer);
 expect((await runLoader({...options,mode:'refresh',inventoryText:inventory(entry)},{fetch:async()=>new Response(body+' ',{headers:{'content-type':'application/json'}})})).status).toBe('complete');
}));

test('bridge refuses aggregate context copies before allocation @covers US-060-AC12',async()=>setup(async root=>{
 const original=' '.repeat(1024*1024),configured=JSON.parse(inventory(entry));configured.max_bytes=2*1024*1024;configured.max_total_bytes=3*1024*1024;
 const result=await runLoader({state:root,pack:{id:'test',version:'1.0.0',loader:{profile:'sec-filings'}},packHash:'a'.repeat(64),inventoryText:JSON.stringify(configured),mode:'backfill',rights:'local-use',userAgent:'Fixture contact@example.org'},{fetch:async()=>new Response(original,{headers:{'content-type':'application/json'}})});expect(result.status).toBe('complete');
 const pointer=await Bun.file(join(root,'current.json')).json(),path=join(root,pointer.manifest),manifest=await Bun.file(path).json();
 manifest.history=Array.from({length:501},(_,context)=>({...manifest.rows[0],metadata:{context}}));manifest.rows=[manifest.history[0]];
 const projected=JSON.stringify(manifest.rows[0])+'\n';await Bun.write(join(path,'../documents.jsonl'),projected);manifest.projection_hash=hash(projected);
 const raw=json(manifest);await Bun.write(path,raw);pointer.sha256=hash(raw);await Bun.write(join(root,'current.json'),json(pointer));
 await expect(readLoaderPublication(root,[{id:entry.id,revision:hash(original)}])).rejects.toThrow('PUBLICATION_COPY_LIMIT');
}));
