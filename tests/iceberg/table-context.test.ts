import {test,expect} from 'bun:test';
import {importIcebergTable,exportIcebergTable,inspectIcebergTableContext,writeDocument,readDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import grammar from '../../spec/extensions/iceberg-table/context-schema.json';
const minimal=await Bun.file('fixtures/iceberg/upstream/core/src/test/resources/TableMetadataV2ValidMinimal.json').json();
const validate=createValidator().compile(grammar);
const check=(raw:string)=>{
 const d=importIcebergTable(raw,{id:'context'}),before=exportIcebergTable(d),r=inspectIcebergTableContext(d);
 expect(validate(r)).toBe(true);expect(r.complete).toBe(false);
 for(const f of ['json','yaml'] as const){const round=readDocument(writeDocument(d,f),f);expect(inspectIcebergTableContext(round)).toEqual(r);expect(exportIcebergTable(round)).toBe(before);}
 expect(exportIcebergTable(d)).toBe(before);return r;
};
test('US-021-AC4: upstream retained references resolve separately from native shape acceptance',async()=>{
 const cases=(await Bun.file('fixtures/iceberg/table/results.json').json()).results;
 for(const c of cases.filter((c:any)=>c.status==='roundtripped'))expect(check(await Bun.file(c.path).text()).status).toBe(c.id==='TableMetadataUnsupportedVersion'?'blocked':'checked');
});
test('US-021-AC4: missing/duplicate current targets block context without destroying source',()=>{
 for(const [selection,collection,idKey] of [['current-schema-id','schemas','schema-id'],['default-spec-id','partition-specs','spec-id'],['default-sort-order-id','sort-orders','order-id']]){
  const absent=structuredClone(minimal);absent[selection!]=999;const a=check(JSON.stringify(absent));expect(a.status).toBe('blocked');expect(a.resolved['/'+selection]).toBeUndefined();
  const duplicate=structuredClone(minimal);duplicate[collection!].push(structuredClone(duplicate[collection!][0]));const b=check(JSON.stringify(duplicate));expect(b.status).toBe('blocked');expect(b.diagnostics.some(d=>d.path==='/'+collection+'/1/'+idKey)).toBe(true);expect(b.resolved['/'+selection]).toBeUndefined();
 }
});
test('US-021-AC4: exact snapshot links, expired parents and main branch coherence',()=>{
 const base=JSON.stringify({...minimal,snapshots:[{'snapshot-id':'BIG','timestamp-ms':1,'parent-snapshot-id':42}], 'current-snapshot-id':'BIG',refs:{main:{type:'branch','snapshot-id':'BIG'},'release/a':{type:'tag','snapshot-id':'BIG'}}}).replaceAll('"BIG"','9007199254740993');
 const ok=check(base);expect(ok.status).toBe('checked');expect(ok.resolved['/refs/release~1a/snapshot-id']).toBe('/snapshots/0');
 const absent=base.replace('"current-snapshot-id":9007199254740993','"current-snapshot-id":9007199254740992');expect(check(absent).status).toBe('blocked');
 expect(check(base.replace('"type":"branch"','"type":"tag"')).status).toBe('blocked');
 const missing=base.replace('"current-snapshot-id":9007199254740993','"current-snapshot-id":null');expect(check(missing).status).toBe('blocked');
 const noCurrent={...minimal,'current-snapshot-id':-1};expect(check(JSON.stringify(noCurrent)).status).toBe('checked');
 const duplicated=base.replace('"snapshots":[','"snapshots":[{"snapshot-id":9007199254740993,"timestamp-ms":2},');expect(check(duplicated).status).toBe('blocked');
});
