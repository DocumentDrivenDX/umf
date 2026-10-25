// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the unchanged TypeScript inspectCoreScalarType predecessor before
// comparing the opt-in Rust core operation.
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {inspectCoreScalarType} from '../../../src/model/scalar-type';
import {uuidDocument,FIELD} from '../../../tests/helpers/uuid-fixtures';

const root=process.cwd();
const closure=[
  'src/model/scalar-type.ts','src/model/types.ts','src/model/errors.ts','src/model/json.ts',
  'src/generated/core-model.ts','src/generated/core-validators.ts','src/validation/document.ts',
  'src/validation/current-policy.ts','src/validation/constraint-kernel.ts','src/validation/schema.ts',
  'src/validation/internal-schema.ts','src/validation/json-equality.ts','src/validation/literal-kernel.ts',
  'src/validation/literal-policy.ts','src/validation/constraint-language.ts','src/registry/registry.ts',
  'spec/core/schema.json','spec/core/scalar-type-inspection-v0.3.schema.json',
  'spec/core/semantic-type-reference.schema.json','spec/metamodel/generated/core-constraints.json',
  'spec/metamodel/generated/domain-policy.json','tests/helpers/uuid-fixtures.ts',
];
const hashes=Object.fromEntries(await Promise.all(closure.map(async path=>[
  path,createHash('sha256').update(new Uint8Array(await Bun.file(resolve(root,path)).arrayBuffer())).digest('hex'),
])));
const unknown=uuidDocument('future_scalar');delete unknown.modules[0]!.elements[0]!.keys;
const missing=uuidDocument();delete missing.modules[0]!.elements[0]!.keys;delete missing.modules[0]!.elements[1]!.scalarType;
const cases:Record<string,[unknown,unknown]>={
  known_uuid:[uuidDocument(),FIELD],unknown_label:[unknown,FIELD],missing_label:[missing,FIELD],
  missing_identity:[uuidDocument(),{}],extra_identity_member:[uuidDocument(),{...FIELD,extra:true}],
  source_diagnostics:[{umf:'0.10.0'},{module:'m',element:'missing'}],
  retired_version:[{umf:'0.9.0'},{module:'m',element:'missing'}],
  missing_element:[uuidDocument(),{module:'m',element:'missing'}],
};
const outcomes=Object.fromEntries(Object.entries(cases).map(([name,[source,identity]])=>{
  try{return [name,{ok:true,value:inspectCoreScalarType(source as never,identity as never)}];}
  catch(error){const e=error as {code?:string;message?:string;path?:string};return [name,{ok:false,error:{code:e.code??'',message:e.message??String(error),path:e.path??''}}];}
}));
const path='docs/helix/04-build/evidence/rust-migration/r5-scalar-type-inspection/frozen-typescript.json';
await mkdir(dirname(resolve(root,path)),{recursive:true});
await Bun.write(path,JSON.stringify({profile:'inspect-core-scalar-type/0.3.0',predecessor:'src/model/scalar-type.ts',sourceClosureSha256:hashes,cases:Object.fromEntries(Object.entries(cases).map(([name,[source,identity]])=>[name,{source,identity}])),outcomes},null,2)+'\n');
console.log(path);
