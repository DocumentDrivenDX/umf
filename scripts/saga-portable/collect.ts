// SPDX-License-Identifier: MIT OR Apache-2.0
/** Retain qualified bytes. Publication consumes these files without rebuilding. */
import {createHash} from 'node:crypto';
import {mkdir,copyFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
const hash=async(path:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
const corpusPath='fixtures/saga/portable.json',corpus=await Bun.file(corpusPath).json(),corpusHash=await hash(corpusPath),release=await Bun.file('spec/release.json').json();
const receipts:Record<string,{sha256:string;report:unknown}>={};
for(const host of ['native','browser','cli','python']){
 const path=`.cache/saga/portable-${host}.json`,report=await Bun.file(path).json();
 const pinned=report.corpusSha256??report.identities?.[corpusPath];
 if(report.cases!==corpus.cases.length||report.passed!==report.cases||pinned!==corpusHash)throw Error(`Unqualified ${host} receipt`);
 receipts[host]={sha256:await hash(path),report};
}
const child=Bun.spawn(['git','rev-parse','HEAD'],{stdout:'pipe',stderr:'inherit'}),commit=(await new Response(child.stdout).text()).trim();if(await child.exited||! /^[0-9a-f]{40}$/.test(commit))throw Error('Source identity unavailable');
const status=Bun.spawn(['git','status','--porcelain','--','src','spec','crates','bindings','python','scripts','tools','tests','fixtures','.github','docs/helix/02-design/contracts','package.json','Cargo.toml','Cargo.lock'],{stdout:'pipe',stderr:'inherit'});const dirty=(await new Response(status.stdout).text()).trim();if(await status.exited||dirty)throw Error('Release source differs from the committed qualification cohort: '+dirty);
const directory=process.env.UMF_SAGA_DIST;if(!directory)throw Error('Set UMF_SAGA_DIST to the qualified wheel/source archive directory');
const consumer=process.env.UMF_SAGA_SDK_CONSUMER;if(!consumer)throw Error('Set UMF_SAGA_SDK_CONSUMER to the qualified SDK installation');
const installed=await Bun.file(join(consumer,'g03-sdk-install-custody.json')).json();
if(installed.archiveSha256!==await hash('.cache/sdk-distribution/umf-sdk.tgz')||installed.sagaCorpusSha256!==corpusHash||installed.sagaResult?.cases!==corpus.cases.length||installed.sagaResult?.passed!==corpus.cases.length)throw Error('SDK installed receipt differs from retained cohort');
const output='.cache/saga/release-candidate';await mkdir(output,{recursive:true});
const files:Record<string,string>={};
async function retain(path:string,name=basename(path)){if(files[name])throw Error('Duplicate retained artifact');await copyFile(path,join(output,name));files[name]=await hash(path);}
await retain('.cache/sdk-distribution/umf-sdk.tgz');await retain('.cache/sdk-distribution/manifest.json','sdk-manifest.json');
const archives=Array.from(new Bun.Glob('*').scanSync({cwd:directory,onlyFiles:true})).filter(name=>name.endsWith('.whl')||name.endsWith('.tar.gz'));
if(archives.filter(n=>n.endsWith('.whl')).length!==1||archives.filter(n=>n.endsWith('.tar.gz')).length!==1)throw Error('Expected exactly one built wheel and source archive');
for(const name of archives)await retain(join(directory,name));
const wheel=archives.find(name=>name.endsWith('.whl'))!;
const pythonReport=(receipts.python!.report as any);if(!Object.entries(pythonReport.identities).some(([path,digest])=>path.endsWith(wheel)&&digest===files[wheel]))throw Error('Installed Python wheel differs from retained bytes');
await retain(join(consumer,'g03-sdk-install-custody.json'),'sdk-installed-custody.json');
await retain(process.env.UMF_SAGA_CLI??'target/release/umf',`umf-${process.platform}-${process.arch}`);
const custody={profile:'umf.saga.release-candidate/1',repository:'DocumentDrivenDX/umf',commit,versions:release,corpusSha256:corpusHash,receipts,files};
await Bun.write(join(output,'custody.json'),JSON.stringify(custody,null,2)+'\n');
files['custody.json']=await hash(join(output,'custody.json'));
await Bun.write(join(output,'SHA256SUMS'),Object.entries(files).sort(([a],[b])=>a.localeCompare(b)).map(([name,digest])=>`${digest}  ${name}\n`).join(''));
console.log(JSON.stringify({commit,files:Object.keys(files),portableCases:corpus.cases.length}));
