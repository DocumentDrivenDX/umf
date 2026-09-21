import {test,expect} from 'bun:test';
import {recordCase} from '../../scripts/core-ideals/record-tablespec-cases';
import {projectRecordToTableSpec,recoverRecordFromTableSpec} from '../../src/core-ideals/record-tablespec-projection';
import {classifyTableSpecRecord} from '../../src/core-ideals/tablespec-record';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {type Document} from '../../src/model/types';
test('record projection orders columns by declared membership and recovers the complete ideal',()=>{
 const {source,author,request}=recordCase();const result=projectRecordToTableSpec(author,request);expect(result.status).toBe('projected');expect(result.residuals).toEqual([]);
 const text=exportTableSpec(result.target!);expect(JSON.parse(text).columns.map((c:any)=>c.name)).toEqual(['id','label','active']);expect(JSON.parse(text).description).toBe('Order record');
 for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(recoverRecordFromTableSpec(receipt,text)).toEqual(source);}
 const nativeOnly=classifyTableSpecRecord(upgradeFieldEnvelope(importTableSpec(text,{id:'native',format:'json'})).target,{recordModule:'records',recordId:'Order',mode:'strict'});
 expect(nativeOnly.mappings.map(m=>m.kind)).toEqual(['field','field','field','record']);expect(nativeOnly.request.authors).toBeUndefined();
});
test('missing, duplicate, non-member and name-colliding bindings block atomically under either policy',()=>{
 for(const mode of ['strict','report'] as const)for(const change of ['missing','duplicate','names','non-member']){
  const {author,request}=recordCase();request.mode=mode;if(change==='missing')request.fields.pop();if(change==='duplicate')request.fields.push(request.fields[0]!);if(change==='non-member')request.fields.push({author,columnName:'extra',nativeType:'INTEGER'});if(change==='names')request.fields[0]!.columnName=request.fields[1]!.columnName;
  const result=projectRecordToTableSpec(author,request);expect(result.status).toBe('blocked');expect(Object.hasOwn(result,'target')).toBe(false);expect(result.diagnostics.some(d=>d.severity==='error')).toBe(true);
 }
});
test('scalar mismatch and renamed columns are reportable but strict refuses them',()=>{
 for(const mode of ['strict','report'] as const){const {source,author,request}=recordCase();request.mode=mode;request.fields[0]!.nativeType='INTEGER';request.fields[1]!.columnName='renamed';
 const result=projectRecordToTableSpec(author,request);expect(result.status).toBe(mode==='strict'?'blocked':'projected');expect(result.residuals.map(r=>r.path)).toContain('/modules/1/elements/2/scalarType');expect(result.residuals.map(r=>r.path)).toContain('/modules/1/elements/1/name');if(result.target)expect(recoverRecordFromTableSpec(result,exportTableSpec(result.target))).toEqual(source);}
});
test('unknown metadata and relationship refinements survive as residuals',()=>{
 const {source}=recordCase();source.modules[0]!.elements[0]!.future={rule:'unknown'};source.modules[0]!.elements[0]!.references![0]!.future='edge';
 const declaration=(module:string,element:string,kind:'field'|'record')=>{const before=copyJson(source) as unknown as Document;delete before.modules.find(m=>m.id===module)!.elements.find(e=>e.id===element)!.kind;return declareCoreElementKind(before,{module,element},kind);};
 const request=recordCase().request;request.mode='report';request.fields=request.fields.map(f=>({...f,author:declaration(f.author.identity.module,f.author.identity.element,'field')}));
 const result=projectRecordToTableSpec(declaration('sales','Order','record'),request);expect(result.status).toBe('projected');expect(result.residuals.map(r=>r.path)).toEqual(['/modules/0/elements/0/references/0/future','/modules/0/elements/0/future']);expect(recoverRecordFromTableSpec(result,exportTableSpec(result.target!))).toEqual(source);
});
test('stale member provenance and edited native/receipt data cannot claim ideal recovery',()=>{
 const {author,request}=recordCase();request.fields[0]!.author.target.future=true;expect(()=>projectRecordToTableSpec(author,request)).toThrow();
 const fresh=recordCase(),result=projectRecordToTableSpec(fresh.author,fresh.request),text=exportTableSpec(result.target!);
 expect(()=>recoverRecordFromTableSpec(result,text+' ')).toThrow();result.mappings[0]!.nativePath='/fake';expect(()=>recoverRecordFromTableSpec(result,text)).toThrow();
});
