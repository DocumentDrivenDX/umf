import {test,expect} from 'bun:test';
import {tableSpecKeyProjectionCases,tableSpecKeyAuthors,keyRecord,keyId,keyCode} from '../../scripts/core-ideals/key-tablespec-projection-cases';
import {projectKeysToTableSpec,verifyKeysTableSpecProjection,recoverKeysTableSpecIdeal} from '../../src/core-ideals/key-tablespec-projection';
import {classifyTableSpecKeys,recoverTableSpecKeySource} from '../../src/core-ideals/key-tablespec';
import {importTableSpec,exportTableSpec} from '../../src/adapters/tablespec';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {declareCoreKey} from '../../src/model/keys';
for(const row of tableSpecKeyProjectionCases())test('authored TableSpec projection: '+row.name,()=>{
 const before=JSON.stringify(row),r=projectKeysToTableSpec(row.source,row.authors,row.request);expect(JSON.stringify(row)).toBe(before);expect(r.status).toBe(row.expected);const count=(row.source.modules[0]!.elements[0]!.keys as unknown[]).length;expect(r.mappings).toHaveLength(count);expect(r.residuals.filter(l=>l.path.includes('/keys/'))).toHaveLength(count);
 if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(()=>verifyKeysTableSpecProjection(r,row.source)).toThrow();return;}
 const native=exportTableSpec(r.target!),parsed=JSON.parse(native);expect(parsed.unique_constraints.length).toBe(count-(r.mappings.some(m=>m.primary)?1:0));
 const imported=importTableSpec(native,{id:row.request.id,format:'json'});expect(imported.modules[0]!.elements.every(e=>!Object.hasOwn(e,'keys'))).toBe(true);
 for(const format of ['json','yaml'] as const){
  const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverKeysTableSpecIdeal(saved,imported)).toEqual(row.source);
  const classification=classifyTableSpecKeys(imported,{mode:'report',profile:'declared-metadata'}),stored=readJsonValue(writeJsonValue(classification,format),format) as unknown as typeof classification;expect(recoverTableSpecKeySource(stored,stored.target!)).toBe(native);
 }
});
test('stable IDs, primary marker and names survive rename and reordered key list',()=>{
 const row=tableSpecKeyProjectionCases().find(r=>r.name==='rename-and-reorder')!,r=projectKeysToTableSpec(row.source,row.authors,row.request);
 expect(r.mappings.map(m=>m.keyId)).toEqual(['stable-code','stable-id']);expect(r.mappings[1]!.keyName).toBe('Renamed identity');expect(r.mappings[1]!.primary).toBe(true);
});
test('rejects missing, duplicate, forged, mismatched and stale authors',()=>{
 const c=tableSpecKeyAuthors();expect(()=>projectKeysToTableSpec(c.source,[c.authors[0]!],c.request)).toThrow();expect(()=>projectKeysToTableSpec(c.source,[c.authors[0]!,c.authors[0]!],c.request)).toThrow();
 const fake=structuredClone(c.authors);fake[0]!.request.id='stable-code';expect(()=>projectKeysToTableSpec(c.source,fake,c.request)).toThrow();
 const stale=structuredClone(c.source);stale.modules[0]!.elements[1]!.description='changed';expect(()=>projectKeysToTableSpec(stale,c.authors,c.request)).toThrow('component changed');
 const renamed=declareCoreKey(c.source,keyRecord,{id:'stable-id',name:'New name',fields:[keyId]});expect(()=>projectKeysToTableSpec(renamed.target,c.authors,c.request)).toThrow('meaning changed');
 const foreign=structuredClone(c.source);foreign.id='another';expect(()=>projectKeysToTableSpec(foreign,c.authors,c.request)).toThrow('author identity');
 const rekey=structuredClone(c.source);(rekey.modules[0]!.elements[0]!.keys as any[])[0].fields=[keyId,keyCode];expect(()=>projectKeysToTableSpec(rekey,c.authors,c.request)).toThrow('meaning changed');
});
test('rejects incomplete column bindings, unknown ownership, native family mismatch and getters',()=>{
 const c=tableSpecKeyAuthors();expect(()=>projectKeysToTableSpec(c.source,c.authors,{...c.request,columns:c.request.columns.slice(0,1)})).toThrow();
 const columns=structuredClone(c.request.columns);columns[1]!.field={module:'other',element:'code'};expect(()=>projectKeysToTableSpec(c.source,c.authors,{...c.request,columns})).toThrow();
 const mismatch=structuredClone(c.request);mismatch.columns[0]!.nativeType='TEXT';expect(projectKeysToTableSpec(c.source,c.authors,mismatch).status).toBe('blocked');
 let reads=0;expect(()=>projectKeysToTableSpec(c.source,c.authors,{...c.request,get mode(){reads++;return 'report' as const;}})).toThrow();expect(reads).toBe(0);
});
test('forged residuals, omitted per-key losses and stale native documents cannot recover ideal',()=>{
 const c=tableSpecKeyAuthors(),r=projectKeysToTableSpec(c.source,c.authors,c.request),fake=structuredClone(r);fake.residuals=fake.residuals.filter(l=>!l.path.includes('/keys/'));expect(()=>verifyKeysTableSpecProjection(fake,r.target!)).toThrow();
 const named=structuredClone(r);named.mappings[0]!.keyId='forged';expect(()=>verifyKeysTableSpecProjection(named,r.target!)).toThrow();
 const native=structuredClone(r.target!);native.id='stale';expect(()=>recoverKeysTableSpecIdeal(r,native)).toThrow();
});
test('compound key order is explicit and changing it invalidates retained authorship',()=>{
 const c=tableSpecKeyProjectionCases().find(r=>r.name==='compound-ordered')!,r=projectKeysToTableSpec(c.source,c.authors,c.request);
 expect(JSON.parse(exportTableSpec(r.target!)).primary_key).toEqual(['external_code','order_id']);
 const changed=structuredClone(c.source);(changed.modules[0]!.elements[0]!.keys as any[])[0].fields.reverse();expect(()=>projectKeysToTableSpec(changed,c.authors,c.request)).toThrow('meaning changed');
});
test('missing or shared Record ownership cannot be projected in report mode',()=>{
 const c=tableSpecKeyAuthors(),missing=structuredClone(c.source);delete missing.modules[0]!.elements[0]!.members;expect(()=>projectKeysToTableSpec(missing,c.authors,c.request)).toThrow('Valid explicit core');
 const shared=structuredClone(c.source);shared.modules[0]!.elements.push({id:'other',kind:'record',members:[keyId],extensions:{}});expect(()=>projectKeysToTableSpec(shared,c.authors,c.request)).toThrow('Valid explicit core');
});
test('unknown ownership, key reference and native extension content survives both formats',()=>{
 const c=tableSpecKeyAuthors(),d=structuredClone(c.source);d.vocabularies.future={version:'1.0.0'};d.extensions={future:{exact:'9007199254740993',bytes:'opaque'}};
 const record=d.modules[0]!.elements[0]!;(record.members as any[])[0].future={owner:'retained'};(record.keys as any[])[0].fields[0].future={component:'retained'};
 const first=declareCoreKey(d,keyRecord,{id:'stable-id',name:'Order identity',fields:[keyId]}),second=declareCoreKey(first.target,keyRecord,{id:'stable-code',name:'External code',fields:[keyCode]}),r=projectKeysToTableSpec(second.target,[first,second],c.request);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverKeysTableSpecIdeal(saved,saved.target!)).toEqual(second.target);}
});
