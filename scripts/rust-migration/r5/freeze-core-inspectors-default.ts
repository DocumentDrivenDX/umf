// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze a manifest of the three already-reviewed R5 predecessor packets.
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
const root=process.cwd();
const sources={scalarType:'docs/helix/04-build/evidence/rust-migration/r5-scalar-type-inspection/frozen-typescript.json',recordMembers:'docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json',referenceLinks:'docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/frozen-typescript.json'};
const packets=Object.fromEntries(await Promise.all(Object.entries(sources).map(async([key,path])=>{
 const bytes=await readFile(resolve(root,path));return [key,{path,sha256:createHash('sha256').update(bytes).digest('hex'),packet:JSON.parse(bytes.toString('utf8'))}];
})));
const output='docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/frozen-predecessors.json';
await mkdir(dirname(resolve(root,output)),{recursive:true});
await writeFile(resolve(root,output),JSON.stringify({profile:'r5-core-inspectors-default/0.1.0',routes:['inspectCoreScalarType','inspectCoreRecordMembers','inspectCoreReferenceLinks'],packets},null,2)+'\n');
console.log(output);
