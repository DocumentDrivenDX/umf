// SPDX-License-Identifier: MIT OR Apache-2.0
/** Fresh actual source mutation against the unchanged independent S17 oracle. */
import {mkdtemp,cp,symlink,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {OracleRow} from './query-oracle';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export async function randomTokenMutant(){
 const work=await mkdtemp(join(tmpdir(),'umf-protection-query-mutant-'));
 try{
  for(const tree of ['src','spec'])await cp(tree,join(work,tree),{recursive:true});
  for(const tree of ['native','node_modules'])await symlink(join(process.cwd(),tree),join(work,tree),'dir');
  await mkdir(join(work,'tests/security/protection'),{recursive:true});
  await cp('tests/security/protection/query-oracle.ts',join(work,'tests/security/protection/query-oracle.ts'));
  const path=join(work,'src/extensions/security/protection/queries.ts'),original=await Bun.file(path).text();
  const needle="transform.kind==='tokenize'&&transform.determinism==='random'&&['join','group'].includes(u.operator)";
  if(original.split(needle).length!==2)throw Error('Exact original random-token guard required');
  const weakened=original.replace(needle,'false');await Bun.write(path,weakened);
  await Bun.write(join(work,'run.ts'),"import {writeFileSync} from 'node:fs';import {runOracle} from './tests/security/protection/query-oracle';writeFileSync(1,JSON.stringify(runOracle('S17'))+'\\n');");
  const child=Bun.spawn([process.execPath,join(work,'run.ts')],{cwd:work,stdout:'pipe',stderr:'pipe'});
  const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  if(exit!==0||stderr)throw Error('Mutant oracle execution failed: '+stderr);
  const rows=JSON.parse(stdout) as OracleRow[];
  const build=await Bun.build({entrypoints:[join(work,'tests/security/protection/query-oracle.ts')],target:'browser',format:'esm'});
  if(!build.success||build.outputs.length!==1)throw Error('Actual mutant browser build failed');
  const js=await build.outputs[0]!.text();if(js.length>16_000_000)throw Error('Mutant bundle bound');
  const expectedFailures:string[]=[];
  for(const op of ['join','group'])for(const props of ['', 'equality','equality,order']){if(props)expectedFailures.push(op+':random:'+props);expectedFailures.push(op+':hard-guard:'+props);}
  return {rows,js,expectedFailures,sourceSha256:hash(original),mutantSha256:hash(weakened),bundleSha256:hash(js),scope:'Fresh copied src/spec and unchanged independent oracle; node_modules/native symlinks shared read-only. Actual single guard removal, not native or hermetic qualification.'};
 }finally{await rm(work,{recursive:true,force:true});}
}
