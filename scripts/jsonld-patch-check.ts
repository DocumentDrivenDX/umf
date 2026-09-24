import {mkdtemp,mkdir,copyFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex'),patch='patches/jsonld@9.0.0.patch',temporary=await mkdtemp(resolve('.cache/jsonld-patch-'));
try{await mkdir(join(temporary,'patches'));await copyFile(patch,join(temporary,patch));await Bun.write(join(temporary,'package.json'),JSON.stringify({private:true,dependencies:{jsonld:'9.0.0'},patchedDependencies:{'jsonld@9.0.0':patch}}));const install=Bun.spawn(['bun','install','--ignore-scripts'],{cwd:temporary,stdout:'pipe',stderr:'pipe'});const code=await install.exited;if(code)throw Error(await new Response(install.stderr).text());const files=[];
 for(const name of ['context.js','expand.js','util.js','compact.js','jsonld.js','frame.js','fromRdf.js','toRdf.js','url.js']){const installed=hash(await Bun.file('node_modules/jsonld/lib/'+name).bytes()),fresh=hash(await Bun.file(join(temporary,'node_modules/jsonld/lib/'+name)).bytes());if(installed!==fresh)throw Error('Fresh patch installation differs: '+name);files.push({path:'lib/'+name,installedSha256:installed,freshInstallSha256:fresh});}
 await Bun.write('fixtures/jsonld/patch-results.json',JSON.stringify({processor:'jsonld 9.0.0 + UMF processing patch',patch,patchSha256:hash(await Bun.file(patch).bytes()),files,freshInstallMatched:true},null,2)+'\n');console.log({freshInstallMatched:true,files:files.length});
}finally{await rm(temporary,{recursive:true,force:true});}
