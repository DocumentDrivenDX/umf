import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const source=join(import.meta.dir,'assets/truss-browser'),output=join(import.meta.dir,'dist/truss-browser');
const provenance=await Bun.file(join(source,'provenance.json')).json();
const compressed=await Bun.file(join(source,'bundle.json.gz')).bytes();
if(hash(compressed)!==provenance.archiveSha256)throw Error('Original Truss archive differs');
const archive=JSON.parse(gunzipSync(compressed,{maxOutputLength:80*1024*1024}).toString('utf8'));
if(hash(archive.manifestUtf8)!==provenance.manifestSha256)throw Error('Original Truss manifest differs');
const manifest=JSON.parse(archive.manifestUtf8),files=new Map<string,Uint8Array>();
if(manifest.interfaceVersion!=='truss-browser-assets/0.1'||manifest.pglite!=='0.5.10'||!Array.isArray(archive.files))throw Error('Unsupported Truss assets');
for(const file of archive.files){
 if(typeof file.path!=='string'||!file.path.split('/').every((part:string)=>/^[a-zA-Z0-9_.-]+$/.test(part)&&part!=='.'&&part!=='..')||file.path==='manifest.json'||files.has(file.path))throw Error('Invalid Truss asset path');
 const bytes=Buffer.from(file.base64,'base64'),expected=manifest.assets[file.path];
 if(!expected||bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw Error('Original Truss asset differs: '+file.path);
 files.set(file.path,bytes);
}
if(files.size!==Object.keys(manifest.assets).length)throw Error('Incomplete Truss asset inventory');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
for(const [path,bytes] of files){const target=join(output,path);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,bytes);}
await writeFile(join(output,'manifest.json'),archive.manifestUtf8);
await writeFile(join(output,'model.json'),await Bun.file(new URL('../../03-test/fixtures/bulk-update/local-products-input.json',import.meta.url)).text());
const build=await Bun.build({entrypoints:[join(import.meta.dir,'truss-catalog-worker.ts')],target:'browser',format:'esm',external:['./truss-browser/store.js'],outdir:join(import.meta.dir,'dist'),naming:'truss-catalog-worker.js'});
if(!build.success)throw Error(build.logs.join('\n'));
console.log('Built pinned Truss browser catalog assets; no action execution support.');
