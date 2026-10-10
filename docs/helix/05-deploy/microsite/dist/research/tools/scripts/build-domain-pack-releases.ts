/** Consumer-invoked archive builder; never fetch upstream sources or publish archives. */
import {mkdtemp,mkdir,rm,readFile,cp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {exportPack} from './loaders/export';
import {hash,json} from './loaders/state';
const outputIndex=process.argv.indexOf('--output');
if(outputIndex<0||!process.argv[outputIndex+1])throw Error('Usage: bun scripts/build-domain-pack-releases.ts --output DIRECTORY (local archives only)');
const repo=resolve(import.meta.dir,'..'),dist=resolve(process.argv[outputIndex+1]);
await mkdir(dist,{recursive:true});const temp=await mkdtemp(join(tmpdir(),'umf-pack-release-'));
const bundles=[];
try{
 for(const id of ['legal-appellate','public-company-intelligence']){
  const packRoot=join(repo,'spec/domain-packs',id),pack=await Bun.file(join(packRoot,'pack.json')).json(),directory=id+'-'+pack.version,out=join(temp,directory);
  await exportPack(join(packRoot,'pack.json'),out,{includeSources:true});
  await cp(join(packRoot,'GUIDE.md'),join(out,'GUIDE.md'));
  const reference=directory+'.zip';
  // Python's standard ZIP writer fixes timestamps/order/permissions for release parity.
  const child=Bun.spawn(['python3','-c',`import pathlib,zipfile,sys
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2])
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file():
   i=zipfile.ZipInfo(root.name+'/'+p.relative_to(root).as_posix(),(2000,1,1,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o100644<<16;z.writestr(i,p.read_bytes(),compresslevel=9)
`,out,join(dist,reference)],{stdout:'pipe',stderr:'pipe'});
  if(await child.exited)throw Error(await new Response(child.stderr).text());
  bundles.push({id,version:pack.version,reference,sha256:hash(new Uint8Array(await readFile(join(dist,reference)))),bytes:(await Bun.file(join(dist,reference)).arrayBuffer()).byteLength});
 }
 await Bun.write(join(dist,'release.json'),json({version:'1.0.0',scope:'Fixed selected corpora with canonical loader companion; no live service claim',bundles}));
 await Bun.write(join(dist,'SHA256SUMS'),bundles.map(b=>b.sha256+'  '+b.reference+'\n').join(''));
 console.log(json({bundles}));
}finally{await rm(temp,{recursive:true,force:true});}
