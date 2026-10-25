// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the current TypeScript inspectCoreReferenceLinks predecessor.
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {inspectCoreReferenceLinks} from '../../../src/model/reference-links';

const root=process.cwd();
const closure=[
 'src/model/reference-links.ts','src/model/types.ts','src/model/errors.ts','src/model/json.ts',
 'src/generated/core-model.ts','src/generated/core-validators.ts','src/validation/document.ts',
 'src/validation/current-policy.ts','src/validation/constraint-kernel.ts','src/validation/schema.ts',
 'src/validation/internal-schema.ts','src/validation/json-equality.ts','src/validation/literal-kernel.ts',
 'src/validation/literal-policy.ts','src/validation/constraint-language.ts','src/registry/registry.ts',
 'spec/core/schema.json','spec/core/reference-links-inspection-v0.3.schema.json',
 'spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json',
];
const hashes=Object.fromEntries(await Promise.all(closure.map(async path=>[
 path,createHash('sha256').update(new Uint8Array(await Bun.file(resolve(root,path)).arrayBuffer())).digest('hex'),
])));
const source=(properties:Record<string,unknown>={})=>({umf:'0.10.0',id:'reference-links-fixture',vocabularies:{},modules:[{id:'m',namespace:'m',elements:[{id:'owner',kind:'record',members:[],extensions:{}},{id:'field',kind:'field',scalarType:'string',extensions:{},...properties},{id:'target',kind:'record',members:[],extensions:{}}]}]});
const ref={role:'record-type',module:'m',element:'target'};
const repeated=source({references:[ref,{...ref,role:'future-role','future/qualifier':{tuple:['b','a']}},ref]});
const cases:Record<string,[unknown,unknown]>={
 known:[source({references:[ref]}),{module:'m',element:'field'}],
 repeated_opaque_order:[repeated,{module:'m',element:'field'}],
 explicit_empty:[source({references:[]}),{module:'m',element:'field'}],
 absent:[source(),{module:'m',element:'field'}],
 missing_element:[source({references:[ref]}),{module:'m',element:'absent'}],
 extra_identity_member:[source({references:[ref]}),{module:'m',element:'field',extra:true}],
 invalid_target:[source({references:[{...ref,element:'absent'}]}),{module:'m',element:'field'}],
 source_diagnostics:[{umf:'0.10.0'},{module:'m',element:'absent'}],
 retired_version:[{umf:'0.9.0'},{module:'m',element:'field'}],
};
const outcomes=Object.fromEntries(Object.entries(cases).map(([name,[doc,identity]])=>{
 try{return [name,{ok:true,value:inspectCoreReferenceLinks(doc as never,identity as never)}]}
 catch(error){const e=error as {code?:string;message?:string;path?:string};return [name,{ok:false,error:{code:e.code??'',message:e.message??String(error),path:e.path??''}}]}
}));
const path='docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/frozen-typescript.json';
await mkdir(dirname(resolve(root,path)),{recursive:true});
await Bun.write(path,JSON.stringify({profile:'inspect-core-reference-links/0.3.0',predecessor:'src/model/reference-links.ts',sourceClosureSha256:hashes,cases:Object.fromEntries(Object.entries(cases).map(([name,[source,identity]])=>[name,{source,identity}])),outcomes},null,2)+'\n');
console.log(path);
