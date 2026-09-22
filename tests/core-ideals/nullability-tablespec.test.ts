import {test,expect} from 'bun:test';
import {nullabilityTableSpecCases,tableSpecAvailabilitySource} from '../../scripts/core-ideals/nullability-tablespec-cases';
import {classifyTableSpecNullability,verifyTableSpecNullabilityClassification,recoverTableSpecNullabilitySource,declareCoreNullability,writeJsonValue,readJsonValue,copyJson,importTableSpecBundle,upgradeFieldEnvelope,classifyTableSpecField,upgradeNullabilityEnvelope,TABLESPEC_NULLABILITY_EXTENSION,tableSpecNullabilityPackage,Registry,validateDocument} from '../../src';
import type {TableSpecNullabilityRequest} from '../../src';
const request:TableSpecNullabilityRequest={column:0,profile:'runtime-model',context:null,carrier:'null-value',mode:'strict'};
const source=()=>tableSpecAvailabilitySource('{"version":"1.0","table_name":"Orders","columns":[{"name":"id","data_type":"INTEGER","nullable":false}]}\n');
test('selected profile/context classification separates exact declarations, coercions and unknowns',()=>{
 for(const c of nullabilityTableSpecCases()){
  const before=structuredClone(c.source),r=classifyTableSpecNullability(c.source,c.request);
  expect(r.status).toBe(c.status);expect(r.mapping.nullability).toBe(c.expected);expect(c.source).toEqual(before);
  if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.residuals.length).toBeGreaterThan(0);continue;}
  expect(r.target!.extensions).toEqual(c.source.extensions);expect(r.target!.modules[0]!.elements[0]!.extensions[TABLESPEC_NULLABILITY_EXTENSION]).toMatchObject({context:c.request.context,carrier:c.request.carrier,profile:c.request.profile});expect(validateDocument(r.target!,new Registry().register(tableSpecNullabilityPackage)).valid).toBe(true);expect(r.target!.modules[0]!.elements[0]!.nullability).toBe(c.expected);
  expect(r.mapping.interpretation==='declared').toBe(c.expected!=='unspecified');
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(verifyTableSpecNullabilityClassification(saved,saved.target!)).toEqual(r);expect(recoverTableSpecNullabilitySource(saved,saved.target!)).toBe(c.text);}
 }
},60000);
test('unresolved carrier blocks strict mode and retains explicit residuals in report mode',()=>{
 for(const mode of ['strict','report'] as const){const r=classifyTableSpecNullability(source(),{...request,carrier:'unresolved',mode});expect(r.mapping.nullability).toBe('unspecified');expect(r.residuals[0]!.reason).toContain('absence carrier');expect(r.status).toBe(mode==='strict'?'blocked':'classified');}
});
test('author provenance, role conflicts, stale models and forged binding metadata refuse',()=>{
 const s=source(),author=declareCoreNullability(s,{module:'table',element:'column:0'},'required');
 expect(classifyTableSpecNullability(author.target,{...request,author}).status).toBe('classified');
 expect(classifyTableSpecNullability(author.target,request).status).toBe('blocked');
 for(const mode of ['strict','report'] as const){const wrong=declareCoreNullability(s,author.identity,'absent-allowed');expect(classifyTableSpecNullability(wrong.target,{...request,mode,author:wrong}).status).toBe('blocked');}
 const stale=structuredClone(author);stale.target.future=true;expect(classifyTableSpecNullability(author.target,{...request,author:stale}).status).toBe('blocked');
 const missing=structuredClone(s);delete missing.modules[0]!.elements[0]!.kind;expect(classifyTableSpecNullability(missing,{...request,mode:'report'}).status).toBe('blocked');
 const r=classifyTableSpecNullability(s,request);
 for(const change of [(v:typeof r)=>{v.mapping.context='different';},(v:typeof r)=>{v.mapping.nullability='absent-allowed';},(v:typeof r)=>{v.diagnostics.push({code:'fake',severity:'warning',path:'',message:'fake'});},(v:typeof r)=>{v.mapping.nativeFragment={kind:'null'};},(v:typeof r)=>{v.binding.version='changed';}]){const altered=structuredClone(r);change(altered);expect(()=>verifyTableSpecNullabilityClassification(altered,altered.target!)).toThrow();}
 const changed=structuredClone(r.target!);changed.future=true;expect(()=>verifyTableSpecNullabilityClassification(r,changed)).toThrow();
 const scoped=structuredClone(s);scoped.modules[0]!.elements[0]!.extensions[TABLESPEC_NULLABILITY_EXTENSION]={future:true};scoped.vocabularies[TABLESPEC_NULLABILITY_EXTENSION]={version:'1.0.0'};expect(classifyTableSpecNullability(scoped,{...request,mode:'report'}).status).toBe('blocked');
 const incompatible=structuredClone(s);incompatible.vocabularies[TABLESPEC_NULLABILITY_EXTENSION]={version:'2.0.0'};expect(classifyTableSpecNullability(incompatible,{...request,mode:'report'}).status).toBe('blocked');
 const legacy=structuredClone(s);legacy.umf='0.2.0';expect(()=>classifyTableSpecNullability(legacy,request)).toThrow();
 let invoked=false;const unsafe=Object.defineProperty({},'column',{enumerable:true,get(){invoked=true;return 0;}});expect(()=>classifyTableSpecNullability(s,unsafe as TableSpecNullabilityRequest)).toThrow();expect(invoked).toBe(false);
});
test('unknown native precision, escaped context keys and split sidecars remain exact',()=>{
 const text='{"version":"1.0","table_name":"Orders","future":9007199254740993,"columns":[{"name":"id","data_type":"INTEGER","nullable":{"EU/~":false,"__proto__":true,"other":"false"}}]}\n';
 const s=tableSpecAvailabilitySource(text);s.vocabularies.future={version:'1.0.0'};s.modules[0]!.elements[0]!.extensions.future={opaque:[null,'keep']};const r=classifyTableSpecNullability(s,{...request,context:'EU/~'});expect(r.target!.modules[0]!.elements[0]!.extensions.future).toEqual(s.modules[0]!.elements[0]!.extensions.future);const malformed=structuredClone(r.target!);delete (malformed.modules[0]!.elements[0]!.extensions[TABLESPEC_NULLABILITY_EXTENSION] as Record<string,unknown>).context;expect(validateDocument(malformed,new Registry().register(tableSpecNullabilityPackage)).valid).toBe(false);expect(r.mapping.nativePath).toEndWith('/members/EU~1~0');expect(recoverTableSpecNullabilitySource(r,r.target!)).toBe(text);
 expect(classifyTableSpecNullability(s,{...request,context:'__proto__'}).mapping.nullability).toBe('absent-allowed');
 const files={'table.yaml':'version: "1.0"\ntable_name: Orders\n','columns/id.yaml':'column:\n  name: id\n  data_type: INTEGER\n  nullable:\n    MD: false\n','notes.txt':'unknown sidecar\n'};
 const initial=importTableSpecBundle(files,{id:'split'}),field=classifyTableSpecField(upgradeFieldEnvelope(initial).target,{column:0,mode:'strict'}),upgraded=upgradeNullabilityEnvelope(field.target!).target;
 const split=classifyTableSpecNullability(upgraded,{...request,context:'MD'});expect(recoverTableSpecNullabilitySource(split,split.target!)).toEqual(files);
});
