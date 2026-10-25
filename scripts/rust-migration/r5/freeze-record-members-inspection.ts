// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the unchanged TypeScript inspectCoreRecordMembers predecessor.
import {createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {inspectCoreRecordMembers} from '../../../src/model/record-members';
import {uuidDocument} from '../../../tests/helpers/uuid-fixtures';

const root=process.cwd();
const closure=[
  'src/model/record-members.ts','src/model/types.ts','src/model/errors.ts','src/model/json.ts',
  'src/generated/core-model.ts','src/generated/core-validators.ts','src/validation/document.ts',
  'src/validation/current-policy.ts','src/validation/constraint-kernel.ts','src/validation/schema.ts',
  'src/validation/internal-schema.ts','src/validation/json-equality.ts','src/validation/literal-kernel.ts',
  'src/validation/literal-policy.ts','src/validation/constraint-language.ts','src/registry/registry.ts',
  'spec/core/schema.json','spec/core/record-members-inspection-v0.3.schema.json',
  'spec/core/semantic-type-reference.schema.json','spec/metamodel/generated/core-constraints.json',
  'spec/metamodel/generated/domain-policy.json','tests/helpers/uuid-fixtures.ts',
];
const hashes=Object.fromEntries(await Promise.all(closure.map(async path=>[
  path,createHash('sha256').update(new Uint8Array(await Bun.file(resolve(root,path)).arrayBuffer())).digest('hex'),
])));
const doc=()=>structuredClone(uuidDocument());
const empty=doc();delete empty.modules[0]!.elements[0]!.keys;empty.modules[0]!.elements[0]!.members=[];
const missing=doc();delete missing.modules[0]!.elements[0]!.keys;delete missing.modules[0]!.elements[0]!.members;
const partial=doc();partial.modules[0]!.elements[0]!.members![0]!.futureQualifier='opaque';
const cases:Record<string,[unknown,unknown]>={
  known:[doc(),{module:'m',element:'record'}],
  reversed_identity_order:[doc(),{element:'record',module:'m'}],
  explicit_empty:[empty,{module:'m',element:'record'}],
  absent:[missing,{module:'m',element:'record'}],
  inapplicable_field:[doc(),{module:'m',element:'value'}],
  unknown_member_qualifier:[partial,{module:'m',element:'record'}],
  unknown_member_surrogate_qualifier:[(()=>{const d=doc();d.modules[0]!.elements[0]!.members![0]!["\ud800"]='opaque';return d;})(),{module:'m',element:'record'}],
  missing_element:[doc(),{module:'m',element:'missing'}],
  extra_identity_member:[doc(),{module:'m',element:'record',extra:true}],
  source_diagnostics:[{umf:'0.10.0'},{module:'m',element:'missing'}],
  retired_version:[{umf:'0.9.0'},{module:'m',element:'record'}],
};
const outcomes=Object.fromEntries(Object.entries(cases).map(([name,[source,identity]])=>{
  try{return [name,{ok:true,value:inspectCoreRecordMembers(source as never,identity as never)}];}
  catch(error){const e=error as {code?:string;message?:string;path?:string};return [name,{ok:false,error:{code:e.code??'',message:e.message??String(error),path:e.path??''}}];}
}));
const path='docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json';
const serialized=JSON.stringify({profile:'inspect-core-record-members/0.3.0',predecessor:'src/model/record-members.ts',sourceClosureSha256:hashes,cases:Object.fromEntries(Object.entries(cases).map(([name,[source,identity]])=>[name,{source,identity}])),outcomes},null,2)+'\n';
if(process.argv.includes('--check')){
  if(await readFile(path,'utf8')!==serialized)throw new Error('Frozen record-members predecessor changed; review before refresh');
  console.log(`${path} (check)`);
}else{
  await mkdir(dirname(resolve(root,path)),{recursive:true});
  await Bun.write(path,serialized);
  console.log(path);
}
