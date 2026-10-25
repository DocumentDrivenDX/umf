// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the current data-only TypeScript SemanticTypeRegistry predecessor.
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {SemanticTypeRegistry} from '../../../src/extensions/semantic-types';

const root=process.cwd();
const closure=['src/extensions/semantic-types/index.ts','src/model/json.ts','src/model/types.ts','src/model/errors.ts','spec/extensions/semantic-types/package.json'];
const hashes=Object.fromEntries(await Promise.all(closure.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(resolve(root,path)).arrayBuffer())).digest('hex')])));
const ref={vocabulary:'example.contact',version:'1.0.0',term:'email'};
const capture=(run:()=>unknown)=>{try{return{ok:true,value:run()}}catch(error){const e=error as {code?:string;message?:string};return{ok:false,error:{code:e.code??'',message:e.message??String(error)}}}};
const outcomes:Record<string,unknown>={};
outcomes.lookup_missing=capture(()=>new SemanticTypeRegistry().lookup(ref));
outcomes.malformed_reference=capture(()=>new SemanticTypeRegistry().register({vocabulary:'',version:'1.0.0',term:'email'} as never,{}));
outcomes.malformed_definition=capture(()=>new SemanticTypeRegistry().register(ref,[] as never));
outcomes.unknown_registration_qualifier=capture(()=>new SemanticTypeRegistry().register({...ref,future:true} as never,{}));
outcomes.duplicate_exact_triple=capture(()=>new SemanticTypeRegistry().register(ref,{}).register(ref,{}));
outcomes.distinct_triples_coexist=capture(()=>{const r=new SemanticTypeRegistry().register(ref,{owner:'a'}).register({...ref,version:'2.0.0'},{owner:'b'});return[r.lookup(ref),r.lookup({...ref,version:'2.0.0'})]});
outcomes.registration_and_lookup_isolation=capture(()=>{const definition={nested:{label:'original'}};const r=new SemanticTypeRegistry().register(ref,definition);definition.nested.label='caller mutation';const first=r.lookup(ref)! as {nested:{label:string}};first.nested.label='lookup mutation';return r.lookup(ref)});
outcomes.utf16_definition_roundtrip=capture(()=>{const definition={astral:'🪼',loneSurrogate:'\ud800'};return new SemanticTypeRegistry().register(ref,definition).lookup(ref)});
const path='docs/helix/04-build/evidence/rust-migration/r5-semantic-type-registry/frozen-typescript.json';
await mkdir(dirname(resolve(root,path)),{recursive:true});
await Bun.write(path,JSON.stringify({profile:'semantic-type-registry-data/1.0.0',predecessor:'src/extensions/semantic-types/index.ts',sourceClosureSha256:hashes,caseInputs:{reference:ref,malformed_reference:{vocabulary:'',version:'1.0.0',term:'email'},malformed_definition:[],unknown_registration_qualifier:{...ref,future:true},duplicate:[ref,ref],distinct:[ref,{...ref,version:'2.0.0'}],mutation:{nested:{label:'original'}},utf16:{astral:'🪼',loneSurrogate:'\ud800'}},outcomes},null,2)+'\n');
console.log(path);
