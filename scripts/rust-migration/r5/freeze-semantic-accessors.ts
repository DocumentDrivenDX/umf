// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the live TypeScript prototype extension accessors and diagnostics.
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {getSemanticTypes,setSemanticTypes,semanticTypesRegistry,SEMANTIC_TYPES_EXTENSION as id} from '../../../src/extensions/semantic-types';
import {validateDocument} from '../../../src/validation/document';
import type {Document} from '../../../src/model/types';

const root=process.cwd();
const closure=[
 'src/extensions/semantic-types/index.ts','src/model/json.ts','src/model/types.ts','src/model/errors.ts',
 'src/validation/document.ts','src/validation/schema.ts','src/validation/internal-schema.ts','src/validation/current-policy.ts',
 'src/validation/constraint-kernel.ts','src/registry/registry.ts','src/generated/core-validators.ts',
 'src/generated/core-model.ts','spec/core/schema.json','spec/core/semantic-type-reference.schema.json',
 'spec/core/extension-package.schema.json','spec/extensions/semantic-types/package.json',
 'spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json',
 'src/model/bit128.ts','src/model/uuid.ts','src/registry/kind-runtime.ts',
 'src/validation/constraint-language.ts','src/validation/json-equality.ts',
 'src/validation/literal-kernel.ts','src/validation/literal-policy.ts',
];
const sourceClosureSha256=Object.fromEntries(await Promise.all(closure.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(resolve(root,path)).arrayBuffer())).digest('hex')])));
const ref={vocabulary:'example.contact',version:'1.0.0',term:'email'};
const base=():Document=>({umf:'0.10.0',id:'semantic-accessors',vocabularies:{[id]:{version:'0.1.0'},future:{version:'9.0.0'}},modules:[{id:'m',namespace:'https://example.test',elements:[{id:'e',scalarType:'string',extensions:{[id]:{types:[ref],future:{opaque:true}},future:{domain_type:'email',recipe:{type:'native'}}}}]}]});
const capture=(run:()=>unknown)=>{try{return{ok:true,value:run()}}catch(error){const e=error as {code?:string;message?:string;path?:string};return{ok:false,error:{code:e.code??'',message:e.message??String(error),path:e.path??''}}}};
const outcomes:Record<string,unknown>={};
outcomes.get_copy_success=capture(()=>{const d=base();const value=getSemanticTypes(d,'m','e');value.types[0]!.term='mutated';return{again:getSemanticTypes(d,'m','e'),source:d};});
outcomes.get_wrong_profile=capture(()=>{const d=base();d.vocabularies[id]!.version='2.0.0';return getSemanticTypes(d,'m','e');});
outcomes.get_missing_profile=capture(()=>{const d=base();delete d.vocabularies[id];return getSemanticTypes(d,'m','e');});
outcomes.get_missing_annotation=capture(()=>{const d=base();delete d.modules[0]!.elements[0]!.extensions[id];return getSemanticTypes(d,'m','e');});
outcomes.get_missing_element=capture(()=>getSemanticTypes(base(),'m','absent'));
outcomes.get_invalid_payload=capture(()=>{const d=base();d.modules[0]!.elements[0]!.extensions[id]={types:[]};return getSemanticTypes(d,'m','e');});
outcomes.set_copy_on_write=capture(()=>{const d=base();const annotation={types:[{...ref,term:'phone'}],future:{kept:true}};const next=setSemanticTypes(d,'m','e',annotation);annotation.types[0]!.term='outside';const returned=getSemanticTypes(next,'m','e');returned.types[0]!.term='returned mutation';return{source:d,result:getSemanticTypes(next,'m','e'),unknownExtension:next.modules[0]!.elements[0]!.extensions.future,profile:next.vocabularies[id]};});
outcomes.set_adds_profile=capture(()=>{const d=base();delete d.vocabularies[id];const next=setSemanticTypes(d,'m','e',{types:[ref]});return{profile:next.vocabularies[id],annotation:getSemanticTypes(next,'m','e')};});
outcomes.set_wrong_profile_precedes_missing_element=capture(()=>{const d=base();d.vocabularies[id]!.version='2.0.0';return setSemanticTypes(d,'m','absent',{types:[ref]});});
outcomes.set_missing_element=capture(()=>setSemanticTypes(base(),'m','absent',{types:[ref]}));
outcomes.set_missing_annotation=capture(()=>setSemanticTypes(base(),'m','e',undefined as never));
outcomes.set_missing_annotation_missing_target=capture(()=>setSemanticTypes(base(),'m','absent',undefined as never));
outcomes.set_malformed_vocabulary_container=capture(()=>{const d=base();(d as any).vocabularies=null;return setSemanticTypes(d,'m','e',{types:[ref]});});
outcomes.set_invalid_annotation=capture(()=>setSemanticTypes(base(),'m','e',{types:[]}));
outcomes.set_unknown_content=capture(()=>{const d=base();const next=setSemanticTypes(d,'m','e',{types:[{...ref,future:{x:1}}],opaque:{x:2}});return{annotation:getSemanticTypes(next,'m','e'),diagnostics:validateDocument(next,semanticTypesRegistry()).diagnostics};});
const warningDocument=base();warningDocument.modules[0]!.elements[0]!.extensions[id]={types:[{...ref,second:true,first:true}],z:1,a:2};
outcomes.diagnostics_warning_order=capture(()=>validateDocument(warningDocument,semanticTypesRegistry()));
const packet={profile:'semantic-types-extension-accessors/1.0.0',predecessor:'src/extensions/semantic-types/index.ts',sourceClosureSha256,caseInputs:{reference:ref,document:base(),warningDocument},outcomes};
const path='docs/helix/04-build/evidence/rust-migration/r5-semantic-type-accessors/frozen-typescript.json';
await mkdir(dirname(resolve(root,path)),{recursive:true});
await Bun.write(path,JSON.stringify(packet,null,2)+'\n');
console.log(path);
