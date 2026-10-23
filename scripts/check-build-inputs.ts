// SPDX-License-Identifier: MIT OR Apache-2.0
/** Check declared package/reference inputs without hydrating historical run output. */
import {resolve,relative,isAbsolute} from 'node:path';
import {realpath} from 'node:fs/promises';

export async function requireLocalInput(root:string,path:string,sha256?:string){
 if(!path||isAbsolute(path)||path.includes('\\')||path.split('/').includes('..'))throw Error('BUILD_INPUT unsafe path '+path);
 const base=await realpath(root),actual=await realpath(resolve(base,path)),inside=relative(base,actual);
 if(inside==='..'||inside.startsWith('../')||isAbsolute(inside))throw Error('BUILD_INPUT escaping input '+path);
 const file=Bun.file(actual),bytes=await file.bytes();
 if(sha256&&new Bun.CryptoHasher('sha256').update(bytes).digest('hex')!==sha256)throw Error('BUILD_INPUT checksum '+path);
 return bytes;
}

export async function checkBuildInputs(root=resolve(import.meta.dir,'..')){
 const seen=new Set<string>();
 async function need(path:string,hash?:string){await requireLocalInput(root,path,hash);seen.add(path);}
 async function read(path:string){await need(path);return JSON.parse(await Bun.file(resolve(root,path)).text());}
 for(const path of ['fixtures/metamodel/current-conformance.json','fixtures/python/core-conformance.json',
  'docs/helix/04-build/evidence/actions-certification.json',
  'docs/helix/04-build/evidence/metamodel-authority/current-native-qualification.json',
  'docs/helix/04-build/evidence/metamodel-authority/retired-core-acceptance.json',
  'docs/helix/04-build/evidence/security/acceptance.json',
  'docs/helix/05-deploy/microsite/dist/reference/manifest.json',
  'docs/helix/05-deploy/microsite/dist/reference/core.html',
  'docs/helix/05-deploy/microsite/dist/actions/manifest.json'])await need(path);
 for await(const path of new Bun.Glob('spec/extensions/*/package.json').scan({cwd:root,onlyFiles:true})){
  const pkg=await read(path);for(const evidence of pkg.capabilities.evidence)await need(evidence);
 }
 const allocations=await read('docs/helix/05-deploy/reference/evidence-map.json');
 for(const allocation of allocations.allocations)await need(allocation.recordPath);
 const operations=await read('docs/helix/05-deploy/reference/operations.json');
 for(const operation of operations.operations)for(const path of operation.fixturePaths)await need(path);
 const history=await read('docs/helix/04-build/evidence/metamodel-authority/history/manifest.json');
 for(const entry of history.entries)await need(entry.archive,entry.sha256);
 const examples=new TextDecoder().decode(await requireLocalInput(root,'docs/helix/05-deploy/schema-browser/example-host.ts'));
 for(const match of examples.matchAll(/['"](fixtures\/[^'"\n]+)['"]/g))await need(match[1]!);
 return {retainedBuildInputs:seen.size};
}
if(import.meta.main)console.log(JSON.stringify(await checkBuildInputs()));
