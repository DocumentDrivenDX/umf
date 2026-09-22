import {test,expect} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import evidence from '../../fixtures/validation/facets-postgresql-constraints-native.json';
import {inspectPostgresqlFacetCatalog,correlatePostgresqlFacetCatalog} from '../../src/adapters/postgresql/facet-catalog';
import {importPostgresqlCatalogCapture,proposePostgresqlCatalogEdit} from '../../src/adapters/postgresql/catalog';
import {renderTree} from '../../src/model/native-json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
import type {Document} from '../../src/model/types';
const source=()=>importPostgresqlCatalogCapture(evidence.sourceText,{id:'facet-catalog'});
const text=()=>JSON.stringify(evidence.capture);
const run=(value=source(),supplement=text())=>correlatePostgresqlFacetCatalog(value,supplement,'little-endian-datum64',backend);
test('complete catalog correspondence preserves sources and verifies overlapping CHECKs',async()=>{
 const r=await run();expect(r.matches).toHaveLength(12);expect(r.matches.filter(m=>m.inspection.state==='verified-expression')).toHaveLength(8);
 expect(r.sameSnapshotVerified).toBe(false);expect(r.authenticated).toBe(false);expect(r.nativeSupplement).toBe(text());
 expect(r.matches.find(m=>m.identity.relation==='signed8')!.columns).toHaveLength(1);expect(r.matches.find(m=>m.identity.relation==='multi_column')!.columns).toHaveLength(2);
 for(const format of ['json','yaml'] as const){const doc=readJsonValue(writeJsonValue(copyJson(source()),format),format) as unknown as Document;expect(copyJson(await run(doc))).toEqual(copyJson(r));}
});
test('omitted, extra, duplicate and inconsistent native observations cannot qualify',async()=>{
 for(const mutate of [
  (c:any)=>c.constraints.pop(),(c:any)=>c.constraints.push(c.constraints[0]),
  (c:any)=>c.constraints[0].name='unknown',(c:any)=>c.constraints[0].definition+=' AND false',
  (c:any)=>c.constraints[0].validated=!c.constraints[0].validated,
  (c:any)=>c.constraints[0].columns[0].modifier=5,
  (c:any)=>c.constraints[0].columns[0].name='renamed',
  (c:any)=>c.constraints[0].columnNumbers=[2],
  (c:any)=>c.constraints[0].columns.push(c.constraints[0].columns[0]),
  (c:any)=>c.serverVersion=170005,
  (c:any)=>c.constraints[0].expression=c.constraints[0].expression.replace('<= 2','<= 3'),
  (c:any)=>c.constraints[0].nodeTree=c.constraints[0].nodeTree.replace('[ 2 0 0 0','[ 3 0 0 0'),
 ]){const c=structuredClone(evidence.capture);mutate(c);await expect(run(source(),JSON.stringify(c))).rejects.toThrow();}
 const edit=proposePostgresqlCatalogEdit(source(),'/snapshot/relations/0/comment','"changed"');await expect(run(edit.document)).rejects.toThrow();
});
test('unknown source content and unsafe unknown numbers remain exact while owned integers reject rounding',async()=>{
 const c=structuredClone(evidence.capture) as any;c.future={meaning:'uninterpreted'};c.constraints[0].future={detail:'opaque'};
 const native=JSON.stringify(c).replace('"detail":"opaque"','"detail":900719925474099312345678901234567890');
 const r=await run(source(),native);expect(r.nativeSupplement).toBe(native);expect(renderTree(r.root)).toContain('900719925474099312345678901234567890');expect(r.matches).toHaveLength(12);
 const unsafe=text().replace('"inheritanceCount":0','"inheritanceCount":0.0000000000000000000000001');expect(()=>inspectPostgresqlFacetCatalog(unsafe)).toThrow();
 expect((await run(source(),text().replace('"UTF8"','"LATIN1"'))).matches.every(m=>m.inspection.state==='unsupported')).toBe(true);
});
