// SPDX-License-Identifier: MIT OR Apache-2.0
// Validate serialized results emitted by the Rust parity test with standalone Ajv 2020.
import Ajv2020 from 'ajv/dist/2020.js';
import {readFile} from 'node:fs/promises';
const root=new URL('../../../../',import.meta.url);
const outputs=JSON.parse(await readFile(process.argv[2]!, 'utf8')) as Record<string,unknown>;
const ajv=new Ajv2020({allErrors:true,strict:false,validateFormats:false});
ajv.addSchema(JSON.parse(await readFile(new URL('spec/core/semantic-type-reference.schema.json',root),'utf8')));
ajv.addSchema(JSON.parse(await readFile(new URL('spec/core/schema.json',root),'utf8')));
const specs=[
 ['kind_inspect_known','spec/core/kind-operation-v8.schema.json'],
 ['kind_inspect_unspecified','spec/core/kind-operation-v8.schema.json'],
 ['kind_declare','spec/core/kind-operation-v6.schema.json'],
 ['kind_verify','spec/core/kind-operation-v6.schema.json'],
 ['kind_surrogate_identity_inspect','spec/core/kind-operation-v8.schema.json'],
 ['nullability_inspect_missing','spec/core/nullability-operation-v7.schema.json'],
 ['nullability_inspect_known','spec/core/nullability-operation-v7.schema.json'],
 ['nullability_inspect_inapplicable','spec/core/nullability-operation-v7.schema.json'],
 ['nullability_declare','spec/core/nullability-operation-v5.schema.json'],
 ['nullability_verify','spec/core/nullability-operation-v5.schema.json'],
 ['nullability_surrogate_identity_inspect','spec/core/nullability-operation-v7.schema.json'],
] as const;
const compiled=new Map<string,ReturnType<typeof ajv.compile>>();
for(const [name,path] of specs){let validate=compiled.get(path);if(!validate){const schema=JSON.parse(await readFile(new URL(path,root),'utf8'));validate=ajv.compile(schema);compiled.set(path,validate);}if(!validate(outputs[name]))throw new Error(`${name}: ${JSON.stringify(validate.errors)}`);}
const inspect=compiled.get('spec/core/kind-operation-v8.schema.json')!;
const badSource=structuredClone(outputs.kind_inspect_known) as any;badSource.source.umf='0.9.0';
if(inspect(badSource))throw new Error('Ajv accepted an invalid nested source document');
const declaration=compiled.get('spec/core/kind-operation-v6.schema.json')!;
const badTarget=structuredClone(outputs.kind_declare) as any;badTarget.target.modules[0].elements[1].id='';
if(declaration(badTarget))throw new Error('Ajv accepted an invalid nested target document');
const badReceiptSource=structuredClone(outputs.kind_declare) as any;badReceiptSource.source={};
if(declaration(badReceiptSource))throw new Error('Ajv accepted an invalid receipt source document');
const badReceiptTarget=structuredClone(outputs.kind_declare) as any;badReceiptTarget.target={};
if(declaration(badReceiptTarget))throw new Error('Ajv accepted an invalid receipt target document');
console.log(`Ajv 2020 accepted ${specs.length} serialized Rust operation envelopes and rejected all four mutated nested-document controls.`);
