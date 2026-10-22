// SPDX-License-Identifier: MIT OR Apache-2.0
import {resolve,join,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtemp,mkdir,rename,rm,readdir} from 'node:fs/promises';
import Ajv from 'ajv/dist/2020';
import {identity,assertJoins,canonical,exclude,type Entry,type ReferenceIndex} from '../../docs/helix/05-deploy/reference/model';
import {root,config,source,read,paths,text,inputs,originals,sha,json} from './io';
import {buildReader} from './reader-build';
import {schemas,extensions,exportsInventory} from './extract';
import {evidence,aggregate} from './evidence';
import {runtimeBuild} from './runtime-build';
import {render,views} from './render';
import {checkBoundaries} from './check-boundaries';
import {validateDocument,createUmfRegistry,Registry,dddRegistry,jsonSchemaRegistry,protobufRegistry} from '../../src/index';
import * as publicApi from '../../src/index';
import {thirdPartyNotices} from '../../docs/helix/05-deploy/schema-browser/notices';
import {rendererArguments,rendererPackage,verifyRendererHost} from './renderer-package';
const output=resolve(root,'docs/helix/05-deploy/microsite/dist/reference');
const {check,candidate}=rendererArguments(process.argv.slice(2));
const renderer=await rendererPackage(root,resolve(output,'..'),candidate);
const expectedRuntime=(await Bun.file(resolve(root,'package.json')).json()).packageManager;if(expectedRuntime!=='bun@'+Bun.version)throw Error('REFERENCE_RUNTIME use the pinned '+expectedRuntime+' toolchain; observed bun@'+Bun.version);
const stage=await mkdtemp(join(tmpdir(),'umf-reference-'));
const ajv=new Ajv({strict:true,allErrors:true,allowUnionTypes:true});
const validators=new Map<string,any>();
async function validate(name:string,value:unknown){let test=validators.get(name);if(!test){test=ajv.compile(await read(config+'/schemas/'+name+'.json'));validators.set(name,test);}if(!test(value))throw Error('REFERENCE_STRUCTURE '+name+' '+JSON.stringify(test.errors));}
async function files(dir:string):Promise<string[]>{try{return(await Promise.all((await readdir(dir,{withFileTypes:true})).map(d=>d.isDirectory()?files(join(dir,d.name)).then(xs=>xs.map(x=>d.name+'/'+x)):Promise.resolve([d.name])))).flat().sort();}catch(e:any){if(e.code==='ENOENT')return [];throw e;}}
async function bounded<T,R>(values:T[],operation:(value:T)=>Promise<R>):Promise<R[]>{const results:R[]=[];for(let offset=0;offset<values.length;offset+=32){const batch=await Promise.allSettled(values.slice(offset,offset+32).map(operation));for(const result of batch){if(result.status==='rejected')throw result.reason;results.push(result.value);}}return results;}
try{
 await checkBoundaries();
 const profiles=await read(config+'/profiles.json');await validate('profiles',profiles);
 const operationConfig=await read(config+'/operations.json');await validate('operations',operationConfig);
 const allocations=await read(config+'/evidence-map.json');await validate('evidence-map',allocations);
 console.log('Extracting schemas and public export graph…');
 const api=await exportsInventory(),schema=await schemas(profiles),ext=await extensions(profiles,schema,api);const entries:Entry[]=[...schema,...ext,...api];
 for(const p of profiles.coreProfiles){const data=JSON.parse(await text(p.schemaPath));if(data.properties.umf.const!==p.version)throw Error('REFERENCE_STRUCTURE core profile mapping');const example={umf:p.version,id:'profile-probe',vocabularies:{},modules:[]};if(!validateDocument(example).valid)throw Error('REFERENCE_STRUCTURE unsupported core profile '+p.version);}
 const registries=publicApi as unknown as Record<string,()=>Registry>;
 for(const mapping of profiles.registrations){const factory=mapping.apiNames.find((n:string)=>registries[n]);if(!factory)throw Error('REFERENCE_LINK unmapped factory');const registry=registries[factory]!();const manifest=registry.get(mapping.extensionId,mapping.version)?.manifest;const entry=ext.find(e=>e.data.extensionId===mapping.extensionId&&e.data.version===mapping.version);if(!manifest||canonical(manifest)!==canonical(entry?.data.manifest))throw Error('REFERENCE_STRUCTURE registration mismatch');if(mapping.mode==='sdk-default'&&!createUmfRegistry().get(mapping.extensionId,mapping.version))throw Error('REFERENCE_STRUCTURE default registry mismatch');}
 const opIds=new Set<string>();for(const op of operationConfig.operations){if(opIds.has(op.id))throw Error('REFERENCE_STRUCTURE duplicate operation');opIds.add(op.id);const allocated=allocations.allocations.filter((a:any)=>a.operationId===op.id);const observations=await Promise.all(allocated.map((a:any)=>evidence(a,op)));const summary=aggregate(observations);const declared=ext.filter(e=>op.id.startsWith(e.data.extensionId+'@'+e.data.version+':'));
  const links=[...declared.map(e=>e.id),...op.apiNames.map((n:string)=>{const a=api.find(e=>e.data.entrypoint==='.'&&e.title===n);if(!a)throw Error('REFERENCE_LINK operation API '+n);return a.id;})];
  entries.push({id:identity('integration',op.id),kind:'integration',title:op.title,summary:op.subset,sources:[await source(config+'/operations.json')],links,data:{operation:op,declarations:declared.flatMap(e=>e.sources),evidence:observations,...summary}});
 }
 for(const a of allocations.allocations)if(!opIds.has(a.operationId))throw Error('REFERENCE_LINK unknown evidence operation');
 for(const path of await paths(config+'/guides/*.md')){const body=await text(path),id=path.split('/').at(-1)!.replace('.md','');entries.push({id:identity('guide',id),kind:'guide',title:body.match(/^# (.+)/)?.[1]??id,summary:body.split('\n\n')[1]??'',sources:[await source(path)],links:[],data:{body:body.replace(/^# .+\n/,''),relatedIds:[]}});}
 const examples=await read(config+'/examples/catalog.json');for(const descriptor of examples){await validate('example',descriptor);const inputSources=await Promise.all(Object.values(descriptor.inputPaths).map(p=>source(p as string)));const guideIds=descriptor.guideIds.map((id:string)=>identity('guide',id));entries.push({id:identity('example',descriptor.id),kind:'example',title:descriptor.id.replaceAll('-',' '),summary:operationConfig.operations.find((o:any)=>o.id===descriptor.operationId)?.title??descriptor.operationId,sources:inputSources,links:[identity('integration',descriptor.operationId),...guideIds],data:{operationId:descriptor.operationId,inputs:inputSources,expected:await source(descriptor.expectedPath),apiIds:[],guideIds}});}
 for(const path of await paths(config+'/overlays/*.json')){const overlay=await read(path);await validate('overlay',overlay);const e=entries.find(e=>e.id===overlay.entryId);if(!e)throw Error('REFERENCE_LINK orphan overlay');if(overlay.summary)e.summary=overlay.summary;if(overlay.body&&e.kind==='guide')e.data.body=overlay.body;if(overlay.relatedIds)e.links.push(...overlay.relatedIds);e.sources.push(await source(path));}
 for(const e of entries){if(e.kind==='schema'&&e.data.profileVersions.length){e.links.push(identity('guide','concepts'),identity('guide','evolution'));const related=['readDocument','writeDocument','validateDocument','selectCoreElements','inspectCoreSchemaProperties','resolveCoreDefault'];for(const name of related){const target=api.find(a=>a.data.entrypoint==='.'&&a.title===name);if(target)e.links.push(target.id);}e.links.push(identity('example','core-semantic'));}if(e.kind==='extension'){const guide=({'umf.ddd':'ddd','umf.binding':'bindings','umf.actions':'actions','umf.security':'security','umf.access':'consumers','umf.dashboard':'consumers','umf.domain-pack':'consumers','umf.dataset-source':'consumers'} as Record<string,string>)[e.data.extensionId]??'extensions';e.links.push(identity('guide',guide));}e.links=[...new Set(e.links)].sort();if(e.kind==='extension')e.links.push(...entries.filter(x=>x.kind==='integration'&&x.links.includes(e.id)).map(x=>x.id));}
 const discovered=entries.map(e=>({id:e.id,kind:e.kind,paths:e.sources.map(s=>s.path)})),retained=exclude(entries,profiles.exclusions);entries.splice(0,entries.length,...retained);
 await Bun.write(join(stage,'discovery.json'),json({profile:'umf.reference.discovery/1',items:discovered.map(e=>({...e,assessment:entries.some(x=>x.id===e.id)?'represented':'excluded'})),exclusions:profiles.exclusions}));
 for(const e of entries.filter(e=>e.kind==='api'))for(const target of entries.filter(x=>x.kind==='schema'&&e.sources.some(s=>s.path===x.data.schemaPath)))e.links.push(target.id);
 assertJoins(entries);
 for(const e of entries)await validate('entry',e);
 await buildReader(stage,entries,profiles,validate);
 console.log('Building fixed runtime, guides and evidence inventory…');
 const evidenceExclusions=[{path:'docs/helix/04-build/evidence/generated-reference/**',reason:'This reference consumer’s own verification outputs are excluded to avoid a build-evidence self-hash cycle; they do not establish native integration support.'}];
 const inventory=[];const evidencePaths=new Set((await Promise.all(['fixtures/validation/**/*.json','fixtures/*/*results*.json','fixtures/*/*oracle*.json','docs/helix/04-build/evidence/**/*.json','docs/helix/04-build/evidence/**/*.md'].map(paths))).flat().filter(path=>!path.startsWith('docs/helix/04-build/evidence/generated-reference/')));
 const sortedEvidence=[...evidencePaths].sort();
 for(let offset=0;offset<sortedEvidence.length;offset+=32)inventory.push(...await Promise.all(sortedEvidence.slice(offset,offset+32).map(async path=>{const mapped=allocations.allocations.filter((a:any)=>a.recordPath===path);return {source:await source(path,false),allocationIds:mapped.map((a:any)=>a.id),assessment:mapped.length?'mapped':'unassessed'};})));
 await Bun.write(join(stage,'evidence-inventory.json'),json({profile:'umf.reference.evidence-inventory/1',items:inventory,exclusions:evidenceExclusions}));
 const runtimeInputs=await runtimeBuild(join(stage,'assets'),api);
 await source('docs/helix/05-deploy/schema-browser/notices.ts',false);
 for(const path of [...await paths('spec/**/LICENSE*'),...await paths('spec/**/NOTICE*'),...await paths('LICENSE*')]){const s=await source(path,false);await Bun.write(join(stage,'licenses',s.sha256+'-'+path.split('/').at(-1)),await Bun.file(resolve(root,path)).bytes());}
 const ui=await Bun.build({entrypoints:[resolve(root,'docs/helix/05-deploy/microsite/reference/index.ts')],target:'browser',format:'esm',minify:true,metafile:true,plugins:[{name:'verified-renderer-package',setup(build){build.onResolve({filter:/^@documentdrivendx\/umf-schema-browser$/},()=>({path:resolve(root,renderer.path,'index.js')}));}}]});if(!ui.success)throw Error(ui.logs.join('\n'));const uiInputs=Object.keys((typeof ui.metafile==='string'?JSON.parse(ui.metafile):ui.metafile as any).inputs).map(path=>resolve(root,path));if(!uiInputs.includes(resolve(root,renderer.path,'index.js')))throw Error('REFERENCE_RENDERER canonical host did not compile the verified package entry');await Bun.write(join(stage,'assets/reference.js'),await ui.outputs[0]!.text());
 await Bun.write(join(stage,'THIRD_PARTY_NOTICES.md'),await thirdPartyNotices(root,[...runtimeInputs,...uiInputs,...(renderer.preview?[]:[renderer.path+'/index.js'])])+(renderer.preview?'\n'+await text(renderer.path+'/THIRD_PARTY_NOTICES.md'):''));
 await Bun.write(join(stage,'assets/reference.css'),await text(renderer.path+'/assets/components.css')+'\n'+await text('docs/helix/05-deploy/microsite/reference/style.css'));
 for(const path of uiInputs)await source(relative(root,path).replaceAll('\\','/'),false);
 await source(renderer.path+'/assets/components.css',false);
 await source(renderer.path+'/index.js',false);
 for(const name of ['package.json','release-manifest.json','provenance.json','THIRD_PARTY_NOTICES.md'])await source(renderer.path+'/'+name,false);
 if(renderer.preview)await source('docs/helix/05-deploy/microsite/dist/schema-browser-release.json',false);
 for(const pattern of ['scripts/reference/**/*.ts',config+'/**/*','docs/helix/05-deploy/microsite/reference/**/*','src/**/*.ts','spec/**/*.json']){const discovered=await paths(pattern);for(let offset=0;offset<discovered.length;offset+=32)await Promise.all(discovered.slice(offset,offset+32).map(path=>source(path,false)));}
 for(const path of ['package.json','bun.lock','tsconfig.json','tsconfig.tools.json','.github/workflows/microsite.yml','.innsigle/config.json','scripts/build-protobuf.ts','scripts/build-postgresql.ts','scripts/protobuf-module-notices.ts',...await paths('native/protobuf/*.go'),...await paths('native/protobuf/go.*'),...await paths('docs/helix/02-design/contracts/CONTRACT-*.md')])await source(path,false);
 const inputList=[...inputs.values()].sort((a,b)=>a.path<b.path?-1:1),inputDigest=sha(canonical(inputList.map(s=>[s.path,s.sha256])));
 const index:ReferenceIndex={profile:'umf.reference/1',entries:[],inputDigest};
 index.entries.push(...await bounded(entries.sort((a,b)=>a.id<b.id?-1:1),async e=>{const bytes=json(e);if(new TextEncoder().encode(bytes).length>8*1024*1024)throw Error('REFERENCE_LIMIT shard '+e.id);const href='entries/'+sha(e.id)+'.json';await Bun.write(join(stage,href),bytes);return {id:e.id,kind:e.kind,title:e.title,summary:e.summary.slice(0,240),href,sha256:sha(bytes),bytes:new TextEncoder().encode(bytes).length};}));
 await validate('index',index);const indexBytes=json(index);if(new TextEncoder().encode(indexBytes).length>2*1024*1024)throw Error('REFERENCE_LIMIT index '+indexBytes.length);await Bun.write(join(stage,'index.json'),indexBytes);
 await bounded([...originals],async([hash,bytes])=>{await Bun.write(join(stage,'sources',hash),bytes);});
 const outputs=await bounded(await files(stage),async path=>{const bytes=await Bun.file(join(stage,path)).bytes();return {path,sha256:sha(bytes),bytes:bytes.length};});
 const manifest={profile:'umf.reference.manifest/1',inputs:inputList,outputs,inputDigest};await validate('manifest',manifest);const manifestBytes=json(manifest);await Bun.write(join(stage,'manifest.json'),manifestBytes);
 const integrity={script:'sha256-'+Buffer.from(sha(await Bun.file(join(stage,'assets/reference.js')).bytes()),'hex').toString('base64'),style:'sha256-'+Buffer.from(sha(await Bun.file(join(stage,'assets/reference.css')).bytes()),'hex').toString('base64')};
 for(const view of views)await Bun.write(join(stage,view+'.html'),render(view,entries,sha(manifestBytes),integrity));
 const expected=await files(stage),actual=await files(output);if(check){if(canonical(expected)!==canonical(actual))throw Error('REFERENCE_DRIFT output membership');await bounded(expected,async path=>{if(sha(await Bun.file(join(stage,path)).bytes())!==sha(await Bun.file(join(output,path)).bytes()))throw Error('REFERENCE_DRIFT '+path);});}
 else {const backup=output+'.previous';await rm(backup,{recursive:true,force:true});if(actual.length)await rename(output,backup);try{await mkdir(resolve(output,'..'),{recursive:true});await rename(stage,output);}catch(error){if(actual.length)await rename(backup,output);throw error;}await rm(backup,{recursive:true,force:true});}
 await verifyRendererHost(root,resolve(output,'..'),renderer.path);
 console.log(JSON.stringify({checked:check,renderer:{mode:renderer.preview?'unpublished-candidate':'installed-release',path:renderer.path},entries:entries.length,schemas:schema.length,extensions:ext.length,exports:api.length,operations:opIds.size,evidenceFiles:inventory.length,indexBytes:indexBytes.length,inputDigest}));
}finally{await rm(stage,{recursive:true,force:true});}
