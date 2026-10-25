// SPDX-License-Identifier: MIT OR Apache-2.0
// Capture raw TypeScript host reflection, refusal order, and profile boundary.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {editJsonSchemaNode,exportJsonSchema,exportJsonSchemaBundle,exportJsonSchemaResources,importJsonSchema,inspectJsonSchema,getJsonSchemaNode,walkJsonSchema} from '../../../src/adapters/json-schema';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const output=resolve(root,'docs/helix/04-build/evidence/rust-migration/r8-json-schema-eight-operations/boundary-predecessor.json');
const sha=async(path:string)=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value));
function outcome(fn:()=>unknown) {
 try{return {status:'returned',value:normalize(fn())};}
 catch(error){const e=error as Error & {code?:string;path?:string};return {status:'threw',name:e.name,code:e.code??null,path:e.path??null,message:e.message};}
}
const cases:unknown[]=[];
function add(id:string,input:unknown,fn:()=>unknown){cases.push({id,input,outcome:outcome(fn)});}
const base='https://schemas.example.test/root.json';
const id='urn:umf:r8:boundary';
const valid=()=>importJsonSchema('{"type":"object"}',{id,baseUri:base});

add('import.invalid-base-before-invalid-source',{baseUri:'relative',source:'{'},()=>importJsonSchema('{',{id,baseUri:'relative'}));
add('import.invalid-resource-uri-before-invalid-root',{resourceUri:'relative',source:'{'},()=>importJsonSchema('{',{id,baseUri:base,resources:{relative:'{'}}));
add('import.invalid-resource-json-before-invalid-root',{resourceUri:'https://schemas.example.test/bad.json',source:'{'},()=>importJsonSchema('{',{id,baseUri:base,resources:{'https://schemas.example.test/bad.json':'{'}}));

const optionTrace:string[]=[];
const getterOptions={id};
Object.defineProperty(getterOptions,'baseUri',{enumerable:true,get(){optionTrace.push('baseUri:get');return base;}});
Object.defineProperty(getterOptions,'resources',{enumerable:true,get(){optionTrace.push('resources:get');return Object.create(null);}});
add('host.options-accessors-are-invoked',{shape:'accessors'},()=>{
 const document=importJsonSchema('{}',getterOptions as any);return {documentId:document.id,trace:optionTrace};
});

const resourceTrace:string[]=[];
const getterResources=Object.create(null);
Object.defineProperty(getterResources,'https://schemas.example.test/r.json',{enumerable:true,get(){resourceTrace.push('resource:get');return '{}';}});
add('host.resource-accessor-is-invoked',{shape:'enumerable-accessor'},()=>{
 const document=importJsonSchema('{}',{id,baseUri:base,resources:getterResources});return {documentId:document.id,trace:resourceTrace};
});

let sourceControlCalls=0;
const controlledSourceOptions={id,baseUri:base,resources:{}};
add('host.source-api-ignores-third-argument-control',{controlPassedAsThirdArgument:true},()=>{
 const document=(importJsonSchema as (...args:any[])=>any)('{}',controlledSourceOptions,{work(){sourceControlCalls++;throw new Error('must remain unused');}} as any);
 return {documentId:document.id,controlCalls:sourceControlCalls};
});

const optionsTrace:string[]=[];
const proxiedOptions=new Proxy({id,baseUri:base,resources:{}},{
 getPrototypeOf(target){optionsTrace.push('options:getPrototypeOf');return Reflect.getPrototypeOf(target);},
 get(target,key,receiver){optionsTrace.push(`options:get:${String(key)}`);return Reflect.get(target,key,receiver);},
});
add('host.options-proxy-trap-order',{shape:'proxy'},()=>{
 const document=importJsonSchema('{}',proxiedOptions);return {documentId:document.id,trace:optionsTrace};
});

const resourceProxyTrace:string[]=[];
const proxiedResources=new Proxy({'https://schemas.example.test/r.json':'{}'},{
 ownKeys(target){resourceProxyTrace.push('resources:ownKeys');return Reflect.ownKeys(target);},
 getOwnPropertyDescriptor(target,key){resourceProxyTrace.push(`resources:descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key);},
 get(target,key,receiver){resourceProxyTrace.push(`resources:get:${String(key)}`);return Reflect.get(target,key,receiver);},
});
add('host.resource-proxy-trap-order',{shape:'proxy'},()=>{
 const document=importJsonSchema('{}',{id,baseUri:base,resources:proxiedResources});return {documentId:document.id,trace:resourceProxyTrace};
});

const profileCases=[
 ['supported.additionalProperties-true','{"type":"object","additionalProperties":true}'],
 ['unsupported.dynamicRef','{"$dynamicRef":"#node"}'],
 ['unsupported.unknown-keyword','{"x-future-rule":{"allow":true}}'],
 ['unsupported.unevaluatedProperties','{"type":"object","unevaluatedProperties":false}'],
] as const;
for(const [name,schema] of profileCases)add(`profile.${name}`,{schema},()=>{
 const document=importJsonSchema(schema,{id:`${id}:${name}`,baseUri:base});
 const validation=inspectJsonSchema(document);
 return {valid:validation.valid,complete:validation.complete,diagnostics:validation.diagnostics.map(({code,path,severity,message})=>({code,path,severity,message}))};
});

const doc=valid();
const apiSchema='{"type":"object","properties":{"x":{"type":"string"}}}';
const apiOptions={id:`${id}:api`,baseUri:base,resources:{'https://schemas.example.test/resource.json':'{"type":"boolean"}'}};
const apiDoc=importJsonSchema(apiSchema,apiOptions);
add('api.importJsonSchema',{source:apiSchema,resourceUris:Object.keys(apiOptions.resources)},()=>importJsonSchema(apiSchema,apiOptions));
add('api.inspectJsonSchema',{document:'apiDoc'},()=>inspectJsonSchema(apiDoc));
add('api.exportJsonSchema',{document:'apiDoc'},()=>exportJsonSchema(apiDoc));
add('api.exportJsonSchemaResources',{document:'apiDoc'},()=>exportJsonSchemaResources(apiDoc));
add('api.exportJsonSchemaBundle',{document:'apiDoc'},()=>exportJsonSchemaBundle(apiDoc));
add('api.getJsonSchemaNode',{document:'apiDoc',pointer:'/properties/x'},()=>getJsonSchemaNode(apiDoc,'/properties/x'));
add('api.walkJsonSchema',{document:'apiDoc'},()=>walkJsonSchema(apiDoc));
add('api.editJsonSchemaNode',{document:'apiDoc',pointer:'/properties/x/type',replacement:'"integer"'},()=>exportJsonSchema(editJsonSchemaNode(apiDoc,'/properties/x/type','"integer"')));
add('get.invalid-pointer-before-copy',{pointer:'/bad~2key'},()=>getJsonSchemaNode(doc,'/bad~2key'));
add('get.raw-non-string-pointer',{pointerType:'number'},()=>getJsonSchemaNode(doc,5 as any));
add('inspect.raw-null-document',{documentType:'null'},()=>inspectJsonSchema(null as any));
add('export.bundle-diagnostic-order',{profile:'supported-root'},()=>{
 const bundle=exportJsonSchemaBundle(doc);
 return {schema:bundle.schema,resourceKeys:Object.keys(bundle.resources),diagnostics:bundle.diagnostics.map(({code,path,severity,message})=>({code,path,severity,message}))};
});

const sourceFiles=['src/adapters/json-schema/index.ts','src/adapters/json-schema/tree.ts','src/model/native-json.ts','src/model/json.ts','src/model/serialization.ts','src/model/document.ts','src/validation/document.ts','src/validation/schema.ts'];
const packet={format:'umf-r8-json-schema-root-boundary-typescript-predecessor/1',runtime:{bun:Bun.version},operationScope:['importJsonSchema','inspectJsonSchema','exportJsonSchema','exportJsonSchemaResources','exportJsonSchemaBundle','getJsonSchemaNode','walkJsonSchema','editJsonSchemaNode'],captureScriptSha256:await sha('scripts/rust-migration/r5/json-schema-root-boundary-predecessor.ts'),sourceHashes:Object.fromEntries(await Promise.all(sourceFiles.map(async path=>[path,await sha(path)]))),caseCount:cases.length,cases};
const body=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==body)throw new Error('Frozen JSON Schema root boundary packet changed; review before refresh');}
else{await mkdir(dirname(output),{recursive:true});await writeFile(output,body);}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',output,caseCount:cases.length,packetSha256:createHash('sha256').update(body).digest('hex')}));
