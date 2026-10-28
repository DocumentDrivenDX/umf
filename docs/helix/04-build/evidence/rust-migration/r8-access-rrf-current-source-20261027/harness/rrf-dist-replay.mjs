import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const repo=process.cwd();
const dist=process.argv[2];
const host=typeof Bun==='undefined'?'node':'bun';
const runtime=host==='node'?`Node ${process.version}`:`Bun ${Bun.version}`;
const packetPath=resolve(repo,'docs/helix/04-build/evidence/rust-migration/r8-postgres-search-rrf-20261027/predecessor.json');
const packetBytes=await readFile(packetPath);
const packet=JSON.parse(packetBytes);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const [{prepareRrfReplayCases,compareRrfReplay},{createAccessRrfOperations},{encodeRequestWire,fromWire,resultError}]=await Promise.all([
  import(pathToFileURL(resolve(repo,'bindings/core/node/tests/access-rrf-replay.js'))),
  import(pathToFileURL(resolve(repo,'bindings/core/node/src/access-rrf.js'))),
  import(pathToFileURL(resolve(repo,'bindings/core/node/src/wire.js'))),
]);
const addon=createRequire(import.meta.url)(resolve(dist,'umf_core_node.node'));
if(typeof addon.executeAccessRrfWire!=='function')throw Error('fresh dist addon lacks executeAccessRrfWire');
const engine=createAccessRrfOperations(request=>{
  const envelope=JSON.parse(addon.executeAccessRrfWire(encodeRequestWire(request)));
  const failure=resultError(envelope);
  if(failure)throw Object.assign(new Error(failure.message),{code:failure.code});
  return fromWire(JSON.parse(envelope.wire));
});
const cases=prepareRrfReplayCases(packet),result=compareRrfReplay(engine,cases);
const receipt={format:'umf-r8-access-rrf-node-current-source/1',host,runtime,profile:engine.profile,packetSha256:sha(packetBytes),nodeAddonSha256:sha(await readFile(resolve(dist,'umf_core_node.node'))),...result};
console.log(JSON.stringify(receipt));
if(result.mismatches.length)process.exitCode=1;
