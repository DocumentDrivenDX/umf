import ts from 'typescript-api';
import {resolve,relative} from 'node:path';
import {identity,canonical,type Entry} from '../../../docs/helix/05-deploy/reference/model';
import {root,source,read,paths,text} from '../io';
import {parseNativeJson} from '../../../src/index';
export async function schemas(profiles:any):Promise<Entry[]>{
 const entries:Entry[]=[];
 for(const path of (await Promise.all(['spec/core/**/*.json','spec/extensions/**/*.json','spec/projections/**/*.json'].map(paths))).flat().sort()){
  const raw=await text(path);let value:any;try{value=JSON.parse(raw);}catch{throw Error('REFERENCE_STRUCTURE '+path);}
  if(!value?.$schema&&!value?.$id&&!/^spec\/extensions\/[^/]+\/schema\.json$/.test(path))continue;
  const profileVersions=profiles.coreProfiles.filter((p:any)=>p.schemaPath===path).map((p:any)=>p.version);
  const refs:any[]=[];const visit=(v:any)=>{if(!v||typeof v!=='object'||Array.isArray(v))return;
   if(v.$schema&&!/^https?:\/\/json-schema.org\/(?:draft[/-]|schema)/.test(v.$schema))return;
   for(const keyword of ['$ref','$dynamicRef'])if(typeof v[keyword]==='string')refs.push({keyword,target:v[keyword]});
   for(const keyword of ['$defs','definitions','properties','patternProperties','dependentSchemas','dependencies'])for(const child of Object.values(v[keyword]??{}))if(!Array.isArray(child))visit(child);
   for(const keyword of ['items','additionalItems','contains','additionalProperties','unevaluatedItems','unevaluatedProperties','propertyNames','not','if','then','else','contentSchema']){const child=v[keyword];if(Array.isArray(child))child.forEach(visit);else visit(child);}
   for(const keyword of ['allOf','anyOf','oneOf','prefixItems'])if(Array.isArray(v[keyword]))v[keyword].forEach(visit);
  };visit(value);
  entries.push({id:identity('schema',path,''),kind:'schema',title:value.title??path.split('/').at(-1),summary:(profileVersions.length?'Core '+profileVersions.join(', ')+' · ':'')+(value.description??path),sources:[await source(path)],links:[],data:{schemaPath:path,pointer:'',role:profileVersions.length?'document':path.includes('extensions')?'extension-payload':path.includes('operation')||path.includes('projection')?'operation':'other',profileVersions,sourceData:parseNativeJson(raw),references:refs}});
 }
 const resources=new Map(entries.map(e=>{const tree=e.data.sourceData;return [tree.members?.$id?.value,e.id];}));
 for(const e of entries)for(const ref of e.data.references){const [resource,fragment]=ref.target.split('#');if(fragment&&!fragment.startsWith('/'))continue;const resolvedId=resource?resources.get(resource):e.id;if(resolvedId){const target=entries.find(x=>x.id===resolvedId)!;let node=target.data.sourceData;try{for(const part of (fragment??'').split('/').slice(1)){const key=decodeURIComponent(part).replaceAll('~1','/').replaceAll('~0','~');node=node?.kind==='object'?node.members[key]:node?.kind==='array'?node.items[Number(key)]:undefined;}if(!node)continue;}catch{continue;}ref.resolvedId=resolvedId;if(resolvedId!==e.id)e.links.push(resolvedId);}}
 return entries;
}
export async function extensions(profiles:any,schemaEntries:Entry[],apiEntries:Entry[]):Promise<Entry[]>{
 const result:Entry[]=[];
 for(const path of await paths('spec/extensions/*/package.json')){
  const manifest=await read(path),schemaPath=path.replace('package.json','schema.json');
  const standalone=await read(schemaPath);if(JSON.stringify(manifest.schema)!==JSON.stringify(standalone)){
   if(canonical(manifest.schema)!==canonical(standalone))throw Error('REFERENCE_STRUCTURE embedded/standalone mismatch '+path);
  }
  const mapping=profiles.registrations.find((r:any)=>r.extensionId===manifest.id&&r.version===manifest.version);
  const apiIds=(mapping?.apiNames??[]).map((n:string)=>{const e=apiEntries.find(e=>e.data.entrypoint==='.'&&e.data.exportName===n);if(!e)throw Error('REFERENCE_LINK missing registration '+n);return e.id;});
  const schemaId=identity('schema',schemaPath,'');if(!schemaEntries.some(e=>e.id===schemaId))throw Error('REFERENCE_LINK missing extension schema '+path);
  result.push({id:identity('extension',manifest.id,manifest.version),kind:'extension',title:manifest.id+' · '+manifest.version,summary:manifest.description,sources:[await source(path)],links:[schemaId,...apiIds],data:{extensionId:manifest.id,version:manifest.version,manifest,schemaId,registration:{mode:mapping?.mode??'unmapped',apiIds,coreProfiles:mapping?.coreProfiles??[]}}});
 }
 return result;
}
export async function exportsInventory():Promise<Entry[]>{
 const pkg=await read('package.json');const configs=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile);const parsed=ts.parseJsonConfigFileContent(configs.config,ts.sys,root);
 const sourceMap:Record<string,string>={'.':'src/index.ts','./loader-contract':'src/domain-packs/loader-contract.ts'};
 const points=Object.keys(pkg.exports);if(points.some(p=>!sourceMap[p]))throw Error('REFERENCE_LINK unknown public entrypoint');
 const program=ts.createProgram(points.map(p=>resolve(root,sourceMap[p]!)),parsed.options),checker=program.getTypeChecker();const entries:Entry[]=[];
 for(const entrypoint of points){const file=program.getSourceFile(resolve(root,sourceMap[entrypoint]!))!,module=checker.getSymbolAtLocation(file);if(!module)throw Error('REFERENCE_STRUCTURE missing export module');
  for(const exported of checker.getExportsOfModule(module).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
   const symbol=exported.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(exported):exported;const decls=symbol.getDeclarations()??[];if(!decls.length)throw Error('REFERENCE_LINK unresolved export '+exported.name);
   const sources=[];for(const d of decls){const path=relative(root,d.getSourceFile().fileName).replaceAll('\\','/');if(path.startsWith('..')||path.includes('node_modules'))continue;const s=await source(path);sources.push({...s,line:d.getSourceFile().getLineAndCharacterOfPosition(d.getStart()).line+1});}
   if(!sources.length)throw Error('REFERENCE_LINK external export '+exported.name);
   const type=checker.getTypeOfSymbolAtLocation(symbol,decls[0]!);const signatures=type.getCallSignatures().map(s=>checker.signatureToString(s,undefined,ts.TypeFormatFlags.NoTruncation));
   const isType=!(symbol.flags&ts.SymbolFlags.Value);const fallback=decls.map(d=>d.getText().slice(0,20000));
   const summary=ts.displayPartsToString(symbol.getDocumentationComment(checker)).slice(0,220)||`${isType?'Type declaration':'Public export'} · ${sources[0]!.path}`;
   entries.push({id:identity('api',entrypoint,exported.name),kind:'api',title:exported.name,summary,sources,links:[],data:{entrypoint,exportName:exported.name,declarations:sources,signatureText:signatures.length?signatures:fallback,runtime:isType?'type-only':'unassessed'}});
  }
 }
 return entries;
}
