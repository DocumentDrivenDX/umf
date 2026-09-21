import {test,expect} from 'bun:test';
import {classifyTableSpecField,verifyTableSpecFieldClassification} from '../../src/core-ideals/tablespec-field';
import {importTableSpec,importTableSpecBundle,exportTableSpec,exportTableSpecBundle} from '../../src/adapters/tablespec';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {readDocument,writeDocument} from '../../src/model/document';
import {copyJson} from '../../src/model/json';
const text=' {"version":"1.0","table_name":"T","columns":[{"name":"x","data_type":"FUTURE","opaque":9007199254740993}]}\n';
const identity={module:'table',element:'column:0'};
const source=()=>upgradeFieldEnvelope(importTableSpec(text,{id:'test',format:'json'})).target;
test('classifies an unknown native column type without inventing scalar family and recovers exact text',()=>{
 for(const mode of ['strict','report'] as const){const doc=source(),result=classifyTableSpecField(doc,{column:0,mode});
  expect(result.status).toBe('classified');expect(result.mapping.outcome).toBe('exact');expect(result.mapping.origin).toBe('classified');
  expect(result.target!.modules[0]!.elements[0]!.kind).toBe('field');expect(Object.hasOwn(result.target!.modules[0]!.elements[0]!,'scalarType')).toBe(false);
  expect(Object.hasOwn(doc.modules[0]!.elements[0]!,'kind')).toBe(false);expect(result.source).toEqual(doc);
  for(const format of ['json','yaml'] as const)expect(exportTableSpec(readDocument(writeDocument(result.target!,format),format))).toBe(text);
 }
});
test('verified authored field agrees; authored record/group and unknown or unverified labels block atomically',()=>{
 for(const mode of ['strict','report'] as const)for(const kind of ['field','record','group'] as const){
  const author=declareCoreElementKind(source(),identity,kind),result=classifyTableSpecField(author.target,{column:0,mode,author});
  expect(result.status).toBe(kind==='field'?'classified':'blocked');expect(result.source).toEqual(author.target);
  expect(result.request.author).toEqual(author);
  if(kind!=='field'){expect(Object.hasOwn(result,'target')).toBe(false);expect(result.residuals[0]!.value).toBe(kind);}
 }
 for(const kind of ['field','future']){const doc=source();doc.modules[0]!.elements[0]!.kind=kind;const r=classifyTableSpecField(doc,{column:0,mode:'report'});expect(r.status).toBe('blocked');expect(Object.hasOwn(r,'target')).toBe(false);}
 const author=declareCoreElementKind(source(),identity,'field');author.target.modules[0]!.namespace='wrong';expect(()=>classifyTableSpecField(author.target,{column:0,mode:'report',author})).toThrow();
});
test('stale author receipts and metadata cannot be used as a native classification basis',()=>{
 const author=declareCoreElementKind(source(),identity,'field');const edited=copyJson(author.target) as unknown as typeof author.target;edited.future='changed';
 const result=classifyTableSpecField(edited,{column:0,mode:'report',author});expect(result.status).toBe('blocked');expect(result.residuals[0]!.reason).toContain('STALE');
 const doc=source();doc.modules[0]!.elements[0]!.name='wrong';expect(()=>classifyTableSpecField(doc,{column:0,mode:'strict'})).toThrow();
 expect(()=>classifyTableSpecField(source(),{column:4,mode:'strict'})).toThrow();
 expect(()=>classifyTableSpecField(importTableSpec(text,{id:'old',format:'json'}),{column:0,mode:'strict'})).toThrow();
});
test('split sources retain sidecars and shadowed metadata after classification',()=>{
 const files={'table.yaml':'version: "1.0"\ntable_name: T\ncolumns: [{shadowed: true}]\n','columns/x.yaml':'column:\n  name: x\n  data_type: INTEGER\nderivation: {opaque: yes}\n','notes.bin':'untouched\u0000sidecar'};
 const doc=upgradeFieldEnvelope(importTableSpecBundle(files,{id:'split'})).target;
 const result=classifyTableSpecField(doc,{column:0,mode:'strict'});expect(result.status).toBe('classified');
 for(const format of ['json','yaml'] as const)expect(exportTableSpecBundle(readDocument(writeDocument(result.target!,format),format))).toEqual(files);
});

test('native classification receipts reject tampering and subsequent native changes',()=>{
 const result=classifyTableSpecField(source(),{column:0,mode:'strict'});
 expect(verifyTableSpecFieldClassification(result,result.target!)).toEqual(result);
 const changed=copyJson(result.target) as unknown as typeof result.source;changed.future={nativeChange:true};
 expect(()=>verifyTableSpecFieldClassification(result,changed)).toThrow();
 result.mapping.nativePath='/wrong';expect(()=>verifyTableSpecFieldClassification(result,result.target!)).toThrow();
});
test('new results always diagnose conflicts while historical receipts remain verifiable',()=>{
 const result=classifyTableSpecField(source(),{column:0,mode:'strict'});expect(result.diagnostics).toEqual([]);
 const legacy:import('../../src/core-ideals/tablespec-field').TableSpecFieldClassification=copyJson(result) as unknown as typeof result;delete legacy.diagnostics;
 expect(verifyTableSpecFieldClassification(legacy,legacy.target!)).toEqual(legacy);
 const changed=copyJson(result) as unknown as typeof result;changed.diagnostics.push({code:'fake',path:'',message:'fake',severity:'warning'});expect(()=>verifyTableSpecFieldClassification(changed,changed.target!)).toThrow('disagrees');
 for(const mode of ['strict','report'] as const){const author=declareCoreElementKind(source(),identity,'record'),blocked=classifyTableSpecField(author.target,{column:0,mode,author});expect(blocked.diagnostics).toHaveLength(1);expect(blocked.diagnostics[0]!.severity).toBe('error');expect(blocked.diagnostics[0]!.path).toBe(blocked.residuals[0]!.path);expect(blocked.diagnostics[0]!.message).toBe(blocked.residuals[0]!.reason);}
});
