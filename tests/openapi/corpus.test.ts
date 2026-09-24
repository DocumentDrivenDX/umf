import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importOpenapiDocument,exportOpenapiDocument,inspectOpenapi,readDocument,writeDocument,proposeOpenapiEdit} from '../../src';
import {parseNativeJson,parseNativeYaml,renderTree} from '../../src/model/native-json';
import manifest from '../../fixtures/openapi/upstream/manifest.json';
test('US-011-AC6: all pinned official examples retain content; fragments stay distinct from full descriptions',async()=>{
 const results=[];
 for(const entry of manifest.files){
  const text=await Bun.file('fixtures/openapi/upstream/'+entry.path).text();
  expect(createHash('sha256').update(text).digest('hex')).toBe(entry.sha256);
  const format=entry.path.endsWith('.json')?'json':'yaml';const tree=(format==='json'?parseNativeJson:parseNativeYaml)(text);
  const native=JSON.parse(renderTree(tree));const version=native.openapi??native.swagger;
  if(!version){expect(()=>importOpenapiDocument(text,{id:entry.path,format})).toThrow();results.push({path:entry.path,role:'referenced-fragment',native});continue;}
  const doc=importOpenapiDocument(text,{id:entry.path,format});expect(inspectOpenapi(doc).valid).toBe(true);
  expect(inspectOpenapi(doc).diagnostics.some(d=>d.code==='OPENAPI_VERSION_UNSUPPORTED')).toBe(false);
  for(const coreFormat of ['json','yaml'] as const)expect(exportOpenapiDocument(readDocument(writeDocument(doc,coreFormat),coreFormat))).toBe(text);
  const exported=exportOpenapiDocument(doc,'json');expect(JSON.parse(exported)).toEqual(native);
  results.push({path:entry.path,role:'description',version,native,exported,diagnostics:inspectOpenapi(doc).diagnostics});
 }
 expect(results.length).toBe(46);expect(results.filter(r=>r.role==='description').length).toBe(38);
 await Bun.write('fixtures/openapi/corpus-results.json',JSON.stringify({commit:manifest.commit,results},null,2)+'\n');
},30000);
test('US-011-AC7: legacy object validation catches version-specific shape errors without changing native semantics',async()=>{
 const cases=[];
 for(const version of ['2.0','3.0.3']){
  const base:any={...(version==='2.0'?{swagger:version}:{openapi:version}),info:{title:'Legacy',version:'1'},paths:{}};
  for(const [name,mutate] of [['missing-title',(v:any)=>delete v.info.title],['missing-paths',(v:any)=>delete v.paths],['invalid-scheme',(v:any)=>version==='2.0'?v.schemes=['wrong']:v.components={securitySchemes:{bad:{type:'http'}}}]] as const){
   const native=structuredClone(base);mutate(native);expect(()=>importOpenapiDocument(JSON.stringify(native),{id:name,format:'json'})).toThrow();cases.push({version,name,native,accepted:false});
  }
  const doc=importOpenapiDocument(JSON.stringify(base),{id:version,format:'json'});
  const edited=proposeOpenapiEdit(doc,'/info/title','"Edited"');expect(JSON.parse(exportOpenapiDocument(edited.document)).info.title).toBe('Edited');expect(JSON.parse(exportOpenapiDocument(doc)).info.title).toBe('Legacy');
  cases.push({version,name:'valid',native:base,accepted:true});
 }
 await Bun.write('fixtures/openapi/legacy-validation-cases.json',JSON.stringify(cases,null,2)+'\n');
});
