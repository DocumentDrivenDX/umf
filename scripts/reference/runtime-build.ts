// SPDX-License-Identifier: MIT OR Apache-2.0
import {resolve,join} from 'node:path';
import {mkdir,unlink} from 'node:fs/promises';
import Ajv from 'ajv/dist/2020';
import standalone from 'ajv/dist/standalone';
import {_} from 'ajv/dist/compile/codegen';
import {_Code} from 'ajv/dist/compile/codegen/code';
import {root,config,read,text,source,sha} from './io';
import {canonical,type Entry} from '../../docs/helix/05-deploy/reference/model';
import {CURRENT_CORE_VERSION} from '../../src/index';
const names=['readJsonValue','writeJsonValue','readDocument','writeDocument','validateDocument','Registry','createUmfRegistry','dddRegistry','jsonSchemaRegistry','protobufRegistry','selectCoreElements','inspectCoreSchemaProperties','resolveCoreDefault','importJsonSchema','projectJsonSchemaToProtobuf','importProtobufSources','parseNativeJson'];
export async function runtimeBuild(output:string,apiEntries:Entry[]){
 await mkdir(output,{recursive:true});
 const facade=names.map(name=>{const e=apiEntries.find(e=>e.data.entrypoint==='.'&&e.title===name);if(!e)throw Error('REFERENCE_LINK public runtime export '+name);return `export {${name}} from ${JSON.stringify(resolve(root,e.sources[0]!.path))};`;}).join('\n');
 const capturePlugin={name:'reference-compile-census',setup(build:any){
  build.onLoad({filter:/\/src\/index\.ts$/},()=>({contents:facade,loader:'ts'}));
  build.onLoad({filter:/\/src\/validation\/schema\.ts$/},async()=>({contents:(await text('src/validation/schema.ts')).replace('return validator;',`const compile=validator.compile.bind(validator),add=validator.addSchema.bind(validator);validator.compile=((schema:any)=>{((globalThis as any).__referenceSchemas??=[]).push(schema);return compile(schema);}) as any;validator.addSchema=((schema:any,...args:any[])=>{((globalThis as any).__referenceSchemas??=[]).push(schema);return (add as any)(schema,...args);}) as any;return validator;`),loader:'ts'}));
 }};
 const collector=await Bun.build({entrypoints:[resolve(root,config,'runtime/index.ts')],target:'bun',format:'esm',metafile:true,plugins:[capturePlugin]});if(!collector.success)throw Error(collector.logs.join('\n'));
 const collectPath=join(output,'collect.mjs');await Bun.write(collectPath,await collector.outputs[0]!.text()+`\nexport async function collect(){for(const registryProfile of ['empty','sdk','ddd','json-schema','protobuf'])await execute({protocol:1,requestId:'collect',operationId:'core-validate',coreProfile:${JSON.stringify(CURRENT_CORE_VERSION)},registryProfile,inputs:{source:${JSON.stringify(await text(config+'/examples/orders.json'))}}});return globalThis.__referenceSchemas;}\n`);
 // Isolated process: no previously cached source modules can hide a compile call.
 const runner=join(output,'collect-run.mjs');await Bun.write(runner,`import {collect} from './collect.mjs';const schemas=await collect()??[];if(!Array.isArray(schemas))throw Error('Reference validator schema census is malformed');await Bun.write(${JSON.stringify(join(output,'checks.json'))},new Blob([JSON.stringify(schemas)]));`);
 const child=Bun.spawn([process.execPath,runner],{cwd:root,stdout:'pipe',stderr:'pipe'});const err=await new Response(child.stderr).text();if(await child.exited)throw Error(err);
 const captured=await Bun.file(join(output,'checks.json')).json(),base=await read(config+'/profiles.json'),actionsSchema=await read('spec/extensions/actions/schema.json');captured.push(await read(config+'/examples/native-schema.json'),await read(base.coreProfiles[0].schemaPath),await read('spec/core/semantic-type-reference.schema.json'),await read('spec/core/extension-package.schema.json'),{$defs:{literal:actionsSchema.$defs.literal},$ref:'#/$defs/literal'},...Object.keys(actionsSchema.$defs).map(key=>({$defs:actionsSchema.$defs,$ref:'#/$defs/'+key})));for(const name of ['json-schema','protobuf','ddd','actions'])captured.push((await read('spec/extensions/'+name+'/package.json')).schema);
 // The bundled public API eagerly initializes some validators via getSchema(id),
 // which bypasses Ajv.prototype.compile. Include every schema resource in the
 // actual runtime dependency graph so those id-based resources are fixed too.
 const collectorMeta=typeof collector.metafile==='string'?JSON.parse(collector.metafile):collector.metafile;
 for(const path of Object.keys(collectorMeta?.inputs??{}).sort())if(path.startsWith('spec/')&&path.endsWith('.schema.json')){
  const resource=await read(path);captured.push(resource);
  if(resource.$defs&&typeof resource.$defs==='object')for(const [key,shape] of Object.entries(resource.$defs)){
   if(!canonical(shape).includes('#/$defs/'))captured.push(shape);
   captured.push({$defs:resource.$defs,$ref:'#/$defs/'+key});
   if(typeof resource.$id==='string')captured.push({$ref:resource.$id+'#/$defs/'+key});
  }
 }
 // This operation resource is used by the SDK key-tuple encoder even though
 // the workbench facade does not expose the encoder itself.
 const keyTupleSchema=await read('spec/core/key-tuple-operation-v4.schema.json');captured.push(keyTupleSchema,keyTupleSchema.$defs.identity);
 const unique=([...new Map(captured.map((s:any)=>[canonical(s),s])).values()] as any[]).sort((a,b)=>{const left=canonical(a),right=canonical(b);return left<right?-1:left>right?1:0;});
 const ajv=new Ajv({allErrors:true,strict:false,allowUnionTypes:true,ownProperties:true,validateFormats:false,code:{source:true,esm:true}});
 const equality=`function equality(v){if(Array.isArray(v))return 'a['+v.map(equality).join(',')+']';if(v&&typeof v==='object')return 'o{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+equality(v[k])).join(',')+'}';return JSON.stringify(v);}`;
 for(const keyword of ['const','enum','uniqueItems'])ajv.removeKeyword(keyword);
 const helper=(c:any)=>c.gen.scopeValue('func',{ref:canonical,code:new _Code('('+equality+')')});
 ajv.addKeyword({keyword:'const',code(c:any){const eq=helper(c);c.fail(_`${eq}(${c.data}) !== ${eq}(${c.schemaCode})`);}});
 ajv.addKeyword({keyword:'enum',schemaType:'array',code(c:any){const eq=helper(c);c.fail(_`!${c.schemaCode}.some(v => ${eq}(v) === ${eq}(${c.data}))`);}});
 ajv.addKeyword({keyword:'uniqueItems',type:'array',schemaType:'boolean',code(c:any){const eq=helper(c);if(c.schema)c.fail(_`new Set(${c.data}.map(${eq})).size !== ${c.data}.length`);}});
 const ids=new Map<string,string>();for(const s of unique)if(s.$id){ajv.addSchema(s,s.$id);ids.set(s.$id,canonical(s));}
 const exported:Record<string,string>={};unique.forEach((s,i)=>{const id=s.$id??'urn:umf:reference:check:'+i;if(!s.$id)ajv.addSchema(s,id);exported['v'+i]=id;});exported.meta='https://json-schema.org/draft/2020-12/schema';
 const code=standalone(ajv,exported);const keys=unique.map(canonical);
 let fixed=code+`\nconst key=v=>{if(Array.isArray(v))return '['+v.map(key).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+key(v[k])).join(',')+'}';return JSON.stringify(v);};const fixed=new Map(${JSON.stringify(keys)}.map((k,i)=>[k,[${unique.map((_,i)=>'v'+i).join(',')}][i]]));\nexport function createValidator(){const aliases=new Map();return {fixedBrowserProfile:true,compile(s){const c=fixed.get(key(s));if(!c)throw Error('Outside the fixed browser profile: '+(s.$id||s.$ref||Object.keys(s).join(','))+'; source retained');return c;},addSchema(s,id){this.compile(s);aliases.set(id??s.$id,s);return this;},getSchema(id){if(id==='https://json-schema.org/draft/2020-12/schema')return meta;const s=aliases.get(id);return s?this.compile(s):undefined;},validateSchema(s){const ok=meta(s);this.errors=meta.errors;return ok;},removeKeyword(){return this;},addKeyword(){return this;}};}export function installJsonEquality(){}\n`;
 const coreSchemaPath=base.coreProfiles[0].schemaPath;fixed+=`export const checkCore=fixed.get(${JSON.stringify(canonical(await read(coreSchemaPath)))});\n`;
 fixed+=`export const checkPackage=fixed.get(${JSON.stringify(canonical(await read('spec/core/extension-package.schema.json')))});\n`;
 // Capture only schema compilation; native grammar validators use the same fixed allowlist.
 const nativeFacade=join(output,'native-facade.ts');await Bun.write(nativeFacade,`import {createValidator} from ${JSON.stringify(resolve(root,'src/validation/schema.ts'))};export default class Fixed {private v=createValidator();errors:any;compile(s:any){return this.v.compile(s);}addSchema(s:any,id?:string){this.v.addSchema(s,id);return this;}getSchema(id:string){return this.v.getSchema(id);}validateSchema(s:any){const ok=this.v.validateSchema(s);this.errors=this.v.errors;return ok;}}`);
 const plugin={name:'reference-fixed-runtime',setup(build:any){
  build.onLoad({filter:/\/src\/index\.ts$/},()=>({contents:facade,loader:'ts'}));
  build.onLoad({filter:/\/src\/validation\/schema\.ts$/},()=>({contents:fixed,loader:'js'}));
  build.onLoad({filter:/\/src\/adapters\/(json-schema|protobuf)\/index\.ts$/},async(args:any)=>({contents:(await Bun.file(args.path).text()).replace(/from 'ajv\/dist\/2020'/g,'from '+JSON.stringify(nativeFacade)),loader:'ts'}));
 }};
 const result=await Bun.build({entrypoints:[resolve(root,config,'runtime/worker.ts')],target:'browser',format:'esm',minify:true,plugins:[plugin],metafile:true});if(!result.success)throw Error(result.logs.join('\n'));
 await Bun.write(join(output,'worker.js'),await text('dist/protobuf/wasm_exec.js')+'\n'+await result.outputs[0]!.text());
 for(const f of ['compiler.wasm','wasm_exec.js','NOTICE.txt']){const dest=f==='wasm_exec.js'?'go.js':f;await source('dist/protobuf/'+f);await Bun.write(join(output,dest),await Bun.file(resolve(root,'dist/protobuf',f)).bytes());}
 for await(const path of new Bun.Glob('dist/protobuf/licenses/*').scan({cwd:root,onlyFiles:true})){await source(path);await Bun.write(join(output,'licenses',path.split('/').at(-1)!),await Bun.file(resolve(root,path)).bytes());}
 const meta=typeof result.metafile==='string'?JSON.parse(result.metafile):result.metafile;for(const p of Object.keys(meta?.inputs??{})){const path=resolve(root,p);if(path.startsWith(root)&&!path.startsWith(output))await source(path.slice(root.length+1),false);}
 await Bun.write(join(output,'validator-inventory.json'),JSON.stringify({profile:'umf.reference.fixed-validators/1',schemas:keys.map(sha)},null,2)+'\n');
 for(const path of ['collect.mjs','collect-run.mjs','checks.json','native-facade.ts'])await unlink(join(output,path));
 return [...Object.keys(meta?.inputs??{}),'node_modules/ajv/dist/ajv.js'];
}
