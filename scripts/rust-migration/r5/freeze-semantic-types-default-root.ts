// SPDX-License-Identifier: MIT OR Apache-2.0
// Capture the default src/index.ts semantic registry/value predecessor.
import {createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import * as api from '../../../src/index';

const root=resolve(import.meta.dir,'../../..');
const out='docs/helix/04-build/evidence/rust-migration/r5-semantic-types-default-root/frozen-typescript.json';
const authority=[
 'src/index.ts','src/extensions/semantic-types/index.ts','src/model/semantic-types.ts','src/model/semantic-types-receipts.ts',
 'src/model/json.ts','src/model/errors.ts','src/model/types.ts','src/validation/document.ts','src/validation/semantic-types.ts',
 'src/validation/internal-schema.ts','src/validation/schema.ts','src/validation/current-policy.ts','src/validation/constraint-kernel.ts',
 'src/validation/json-equality.ts','src/generated/core-validators.ts','src/generated/core-model.ts','spec/core/schema.json',
 'spec/core/semantic-type-reference.schema.json','spec/core/semantic-types-operation.schema.json',
 'spec/extensions/semantic-types/package.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json',
 'tests/semantic-types/semantic-types.test.ts','tests/semantic-types/core.test.ts',
 'docs/helix/02-design/contracts/CONTRACT-078-semantic-types.md'
].sort();
const sourceHashes=Object.fromEntries(await Promise.all(authority.map(async path=>[path,createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')])));
const exportNames=Object.keys(api).filter(name=>/semantic.?type/i.test(name)).sort();
const required=['SEMANTIC_TYPES_EXTENSION','SemanticTypeRegistry','semanticTypesPackage','semanticTypesRegistry','validateSemanticTypeValue','validateCoreSemanticTypeValue','coreSemanticTypeReferenceSchema','coreSemanticTypesOperationSchema'];
for(const name of required)if(!exportNames.includes(name))throw new Error(`Default root export missing: ${name}`);
const {SemanticTypeRegistry,validateSemanticTypeValue,validateCoreSemanticTypeValue}=api;
const ref=(term:string)=>({vocabulary:'example.contact',version:'1.0.0',term});
const capture=(run:()=>unknown)=>{try{return{ok:true,value:run()}}catch(error){const e=error as {code?:string;message?:string;path?:string};return{ok:false,error:{code:e.code??null,message:String(e.message??error),path:e.path??null}}}};
const check=(status:'valid'|'invalid'|'unknown',complete:boolean,issues:string[]=[])=>( {status,complete,issues} );
const registry:any={};
registry.admission=capture(()=>{
 const r=new SemanticTypeRegistry().register(ref('one'),{x:1});
 let duplicate='';try{r.register(ref('one'),{});}catch(e){duplicate=(e as {code:string}).code;}
 return {duplicate,distinct:r.register({...ref('one'),version:'2'},{x:2})===r,first:r.lookup(ref('one')),second:r.lookup({...ref('one'),version:'2'}),missing:r.lookup(ref('missing'))};
});
registry.errors={};
registry.errors.bad_reference=capture(()=>new SemanticTypeRegistry().register({...ref('x'),term:''},{}));
registry.errors.unknown_registration_qualifier=capture(()=>new SemanticTypeRegistry().register({...ref('x'),future:true} as never,{}));
registry.errors.bad_definition=capture(()=>new SemanticTypeRegistry().register(ref('x'),[] as never));
registry.errors.bad_validator=capture(()=>new SemanticTypeRegistry().register(ref('x'),{},42 as never));
registry.copy_isolation=capture(()=>{const d={nested:{value:'source'}};const r=new SemanticTypeRegistry().register(ref('copy'),d);d.nested.value='changed';const got=r.lookup(ref('copy'))! as {nested:{value:string}};got.nested.value='returned';return r.lookup(ref('copy'));});
registry.unknown_lookup_qualifier=capture(()=>new SemanticTypeRegistry().register(ref('known'),{}).lookup({...ref('known'),future:{x:1}} as never));
const direct:any={};
direct.missing_term=capture(()=>validateSemanticTypeValue(ref('absent'),null,new SemanticTypeRegistry()));
direct.null_is_forwarded=capture(()=>{let seen='unset';const r=new SemanticTypeRegistry().register(ref('null'),{},v=>{seen=v===null?'null':'other';return check('valid',true);});return {result:validateSemanticTypeValue(ref('null'),null,r),seen};});
direct.callback_input_isolation=capture(()=>{const r=new SemanticTypeRegistry().register(ref('iso'),{deep:{v:1}},(v,d)=>{(v as any).x=1;(d.deep as any).v=2;return check('valid',true);});const input:any={};const result=validateSemanticTypeValue(ref('iso'),input,r);return {result,input,definition:r.lookup(ref('iso'))};});
direct.unknown_qualifier=capture(()=>validateSemanticTypeValue({...ref('known'),locale:{x:1}} as never,null,new SemanticTypeRegistry().register(ref('known'),{},()=>check('valid',true))));
direct.malformed_result=capture(()=>validateSemanticTypeValue(ref('bad'),null,new SemanticTypeRegistry().register(ref('bad'),{},()=>({status:'unknown',complete:true,issues:[]} as never))));
direct.throw=capture(()=>validateSemanticTypeValue(ref('throws'),null,new SemanticTypeRegistry().register(ref('throws'),{},()=>{throw new Error('validator failed');})));
const document=(types:any[]|undefined)=>({umf:'0.10.0',id:'frozen-semantic-default',vocabularies:{},modules:[{id:'m',namespace:'https://example.test',elements:[{id:'e',kind:'field',scalarType:'string',extensions:{future:{kept:['🪼',3]}},...(types===undefined?{}:{semanticTypes:types})}]}]}) as any;
const identity={module:'m',element:'e'};
const aggregate:any={};
const ordered=new SemanticTypeRegistry().register(ref('a'),{},()=>check('valid',true,['a']))
 .register(ref('b'),{},()=>check('invalid',true,['b'])).register(ref('c'),{},()=>check('unknown',false,['c']));
aggregate.order_and_status=capture(()=>validateCoreSemanticTypeValue(document([ref('a'),ref('b'),ref('c')]),identity,null,ordered));
aggregate.unknown_qualifier_retained=capture(()=>validateCoreSemanticTypeValue(document([{...ref('a'),locale:{future:'retained'}}]),identity,null,new SemanticTypeRegistry()));
aggregate.no_declaration=capture(()=>validateCoreSemanticTypeValue(document(undefined),identity,'v',new SemanticTypeRegistry()));
aggregate.copy_and_unknown_extensions=capture(()=>validateCoreSemanticTypeValue(document([ref('absent')]),identity,'v',new SemanticTypeRegistry()));
aggregate.resource_boundaries={};
for(const depth of [128,129]){let value:any='leaf';for(let i=0;i<depth;i++)value={x:value};aggregate.resource_boundaries[`definition_depth_${depth}`]=capture(()=>new SemanticTypeRegistry().register(ref(`depth-${depth}`),value));}
for(const count of [100000,100001]){const value=new Array(count-2).fill(null);aggregate.resource_boundaries[`definition_visited_values_${count}`]=capture(()=>new SemanticTypeRegistry().register(ref(`count-${count}`),{values:value}));}
const packet={schema:'umf.r5.semantic-types.default-root-freeze.v1',profile:'default-root-semantic-registry-value/1.0.0',runtime:{bun:Bun.version},defaultRoot:'src/index.ts',semanticTypeRuntimeExports:exportNames,requiredExports:required,authorityClosureSha256:sourceHashes,cases:{registry,direct,aggregate}};
const actual=JSON.stringify(packet,null,2)+'\n';
const args=process.argv.slice(2);
if(args.length===0){console.log(`Usage: bun scripts/rust-migration/r5/freeze-semantic-types-default-root.ts --check|--freeze`);}
else if(args.length!==1||!['--check','--freeze'].includes(args[0]!))throw new Error('Expected exactly one of --check or --freeze');
else if(args[0]==='--check'){
 const saved=await Bun.file(resolve(root,out)).text();
 if(saved!==actual)throw new Error(`Frozen predecessor or authority closure differs: ${out}`);
 console.log(`checked ${Object.keys(sourceHashes).length} authority sources, ${exportNames.length} runtime exports, ${out}`);
}else{await mkdir(dirname(resolve(root,out)),{recursive:true});await Bun.write(resolve(root,out),actual);console.log(`wrote ${out}`);}
