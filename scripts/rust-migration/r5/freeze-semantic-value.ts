// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the live synchronous TypeScript semantic-value predecessor.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {SemanticTypeRegistry,validateSemanticTypeValue,type SemanticTypeCheck} from '../../../src/extensions/semantic-types';
import {validateCoreSemanticTypeValue} from '../../../src/model/semantic-types';

const root=resolve(import.meta.dir,'../../..');
const closure=['src/extensions/semantic-types/index.ts','src/model/semantic-types.ts','src/model/semantic-types-receipts.ts','src/model/json.ts','src/model/types.ts','src/model/errors.ts','src/validation/document.ts','src/validation/semantic-types.ts','src/validation/internal-schema.ts','src/validation/schema.ts','src/validation/current-policy.ts','src/validation/constraint-kernel.ts','src/validation/json-equality.ts','src/generated/core-validators.ts','src/generated/core-model.ts','spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/semantic-types-operation.schema.json','spec/extensions/semantic-types/package.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json'];
const sourceHashes=Object.fromEntries(await Promise.all(closure.map(async path=>[path,createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')])));
const ref=(term:string)=>({vocabulary:'example.contact',version:'1.0.0',term});
const capture=(run:()=>unknown)=>{try{return{ok:true,value:run()}}catch(error){const e=error as {code?:string;message?:string;path?:string};return{ok:false,error:{code:e.code??null,message:String(e.message??error),path:e.path??null}}}};
const outcome=(status:'valid'|'invalid'|'unknown',complete:boolean,issues:string[]=[]):SemanticTypeCheck=>({status,complete,issues});
const direct:any={};
const run=(reference:any,value:any,registry:SemanticTypeRegistry)=>capture(()=>validateSemanticTypeValue(reference,value,registry));
direct.valid=run(ref('valid'),null,new SemanticTypeRegistry().register(ref('valid'),{},_v=>outcome('valid',true)));
direct.invalid=run(ref('invalid'),'x',new SemanticTypeRegistry().register(ref('invalid'),{},_v=>outcome('invalid',true,['bad'])));
direct.unknown_missing_term=run(ref('absent'),null,new SemanticTypeRegistry());
direct.unknown_missing_validator=run(ref('no-validator'),null,new SemanticTypeRegistry().register(ref('no-validator'),{}));
direct.unknown_qualifier=run({...ref('valid'),future:{kept:true}},null,new SemanticTypeRegistry().register(ref('valid'),{},()=>outcome('valid',true)));
direct.throw_error=run(ref('throws'),'x',new SemanticTypeRegistry().register(ref('throws'),{},()=>{throw new Error('validator broke')}));
direct.throw_empty_error=run(ref('throws-empty'),'x',new SemanticTypeRegistry().register(ref('throws-empty'),{},()=>{throw new Error('')}));
direct.throw_utf16_error=run(ref('throws-utf16'),'x',new SemanticTypeRegistry().register(ref('throws-utf16'),{},()=>{throw new Error('bad \ud800')}));
direct.throw_non_error=run(ref('throws-non-error'),'x',new SemanticTypeRegistry().register(ref('throws-non-error'),{},()=>{throw {message:'not an Error'};}));
direct.malformed_non_json_return=run(ref('malformed'),'x',new SemanticTypeRegistry().register(ref('malformed'),{},()=>undefined as never));
direct.malformed_extra_field=run(ref('extra'),'x',new SemanticTypeRegistry().register(ref('extra'),{},()=>({status:'valid',complete:true,issues:[],future:true} as never)));
direct.malformed_unknown_complete=run(ref('unknown-complete'),'x',new SemanticTypeRegistry().register(ref('unknown-complete'),{},()=>outcome('unknown',true,['uncertain'])));
const isolationDefinition={nested:{name:'before'}};
const isolationRegistry=new SemanticTypeRegistry().register(ref('isolation'),isolationDefinition,(value,definition)=>{(value as any).changed=true;(definition.nested as any).name='callback';return outcome('valid',true)});
direct.input_definition_isolation=run(ref('isolation'),{nested:{name:'value'}},isolationRegistry);
direct.lookup_after_callback=isolationRegistry.lookup(ref('isolation'));

const registration:any={};
registration.copy_and_lookup=capture(()=>{
 const source={nested:{term:'before'}};
 const registry=new SemanticTypeRegistry().register(ref('registration-copy'),source as any);
 source.nested.term='mutated';
 const found=registry.lookup(ref('registration-copy')) as any;
 if(found)found.nested.term='returned-copy-mutated';
 return registry.lookup(ref('registration-copy'));
});
registration.lookup_missing=capture(()=>{
 const found=new SemanticTypeRegistry().lookup(ref('registration-absent'));
 return found===undefined?{$undefined:true}:found;
});
registration.duplicate=capture(()=>new SemanticTypeRegistry().register(ref('duplicate'),{}).register(ref('duplicate'),{}));
registration.malformed_empty_term=capture(()=>new SemanticTypeRegistry().register({...ref('bad'),term:''},{}));
registration.malformed_non_string_version=capture(()=>new SemanticTypeRegistry().register({...ref('bad'),version:42} as any,{}));
registration.unknown_identity_qualifier=capture(()=>new SemanticTypeRegistry().register({...ref('bad'),future:true} as any,{}));
registration.non_object_definition=capture(()=>new SemanticTypeRegistry().register(ref('bad-definition'),[] as any));
registration.non_function_validator=capture(()=>new SemanticTypeRegistry().register(ref('bad-validator'),{},42 as any));
registration.non_function_precedes_duplicate=capture(()=>new SemanticTypeRegistry().register(ref('ordered-validator'),{}).register(ref('ordered-validator'),{},42 as any));
registration.definition_precedes_non_function=capture(()=>new SemanticTypeRegistry().register(ref('bad-definition-order'),[] as any,42 as any));
const work:any={};
const workRegistry=new SemanticTypeRegistry().register(ref('work'),{},((_v:any,_d:any,control:any)=>{control?.reportWork?.(1);control?.reportWork?.(2);return outcome('valid',true)}) as any);
work.valid_repeated=capture(()=>validateSemanticTypeValue(ref('work'),null,workRegistry));
for (const [name,reported] of [['negative',-1],['fractional',1.5],['unsafe',Number.MAX_SAFE_INTEGER+1]] as const) {
 const registry=new SemanticTypeRegistry().register(ref(`work-${name}`),{},((_v:any,_d:any,control:any)=>{control?.reportWork?.(reported);return outcome('valid',true)}) as any);
 work[name]=capture(()=>validateSemanticTypeValue(ref(`work-${name}`),null,registry));
}

const makeDoc=(references:any[]|undefined)=>({umf:'0.10.0',id:'semantic-value-freeze',vocabularies:{},modules:[{id:'m',namespace:'https://example.test',elements:[{id:'e',kind:'field',scalarType:'string',extensions:{},...(references===undefined?{}:{semanticTypes:references})}]}]}) as any;
const identity={module:'m',element:'e'};
const agg:any={};
const orderedRegistry=new SemanticTypeRegistry()
 .register(ref('one'),{n:1},()=>outcome('valid',true,['one-valid']))
 .register(ref('two'),{n:2},()=>outcome('invalid',true,['two-invalid']))
 .register(ref('three'),{n:3},()=>outcome('unknown',false,['three-unknown']));
agg.order_and_invalid_dominates=capture(()=>validateCoreSemanticTypeValue(makeDoc([ref('one'),ref('two'),ref('three')]),identity,null,orderedRegistry));
agg.absent_declaration=capture(()=>validateCoreSemanticTypeValue(makeDoc(undefined),identity,null,new SemanticTypeRegistry()));
agg.unknown_dominates_valid=capture(()=>validateCoreSemanticTypeValue(makeDoc([ref('one'),ref('missing')]),identity,'x',new SemanticTypeRegistry().register(ref('one'),{},()=>outcome('valid',true))));
let malformedDocCalls=0;const malformedDoc=makeDoc([ref('one')]);malformedDoc.modules[0].elements[0].semanticTypes=[];
agg.document_refusal_precedes_callback=capture(()=>validateCoreSemanticTypeValue(malformedDoc,identity,'x',new SemanticTypeRegistry().register(ref('one'),{},()=>{malformedDocCalls++;return outcome('valid',true)})));
agg.document_refusal_callback_count=malformedDocCalls;
const packet={schema:'umf.r5.semantic-value.typescript-freeze.v3',capturedAt:new Date().toISOString(),runtime:{bun:Bun.version},sourceHashes,cases:{registration,direct,aggregate:agg,work}};
const out=resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-semantic-value/frozen-typescript.json');await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(packet,null,2)+'\n');console.log(out);
