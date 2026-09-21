import {test,expect} from 'bun:test';
import {classifyPostgresqlField,recoverPostgresqlFieldCapture} from '../../src/core-ideals/postgresql-field';
import {importPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../../src/adapters/postgresql/catalog';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const nativeSource=' \n'+await Bun.file('fixtures/postgresql/catalog-capture.json').text()+'\n';
const source=()=>upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'pg'})).target;
test('catalog fields include native domains, arrays and unknown scalar refinements without erasure',()=>{
 const doc=source(),columns=getPostgresqlColumnMetadata(doc).filter(c=>c.relation.name==='scalar_types');expect(columns).toHaveLength(20);
 for(const column of columns){const result=classifyPostgresqlField(doc,{column:column.path,nativeSource,mode:'strict'});
  expect(result.status).toBe('classified');expect(result.mapping.nativeFragment).toEqual(copyJson(column.nativeColumn));
  const element=result.target!.modules.find(m=>m.id==='postgresql.columns')!.elements.find(e=>e.id===column.element.id)!;
  expect(element.kind).toBe('field');expect(element.scalarType).toBe(column.element.scalarType);expect(recoverPostgresqlFieldCapture(result,result.target!)).toBe(nativeSource);
 }
},30000);
test('native text formatting and unknown numeric metadata survive both receipt formats',()=>{
 const text=nativeSource.replace('{','{"future":9007199254740993,');
 const doc=upgradeFieldEnvelope(importPostgresqlCatalogCapture(text,{id:'opaque'})).target,column=getPostgresqlColumnMetadata(doc)[0]!;
 const result=classifyPostgresqlField(doc,{column:column.path,nativeSource:text,mode:'report'});
 for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;expect(recoverPostgresqlFieldCapture(back,back.target!)).toBe(text);}
},30000);
test('verified authored conflict blocks both modes without a partial target',()=>{
 const doc=source(),column=getPostgresqlColumnMetadata(doc).find(c=>c.element.scalarType===undefined)!;
 const author=declareCoreElementKind(doc,{module:'postgresql.columns',element:column.element.id},'record');
 for(const mode of ['strict','report'] as const){const result=classifyPostgresqlField(author.target,{column:column.path,nativeSource,mode,author});expect(result.status).toBe('blocked');expect(Object.hasOwn(result,'target')).toBe(false);expect(result.residuals[0]!.value).toBe('record');}
});
test('stale core metadata, mismatched archives, future servers and edited receipts fail',()=>{
 const doc=source(),column=getPostgresqlColumnMetadata(doc)[0]!;
 expect(()=>classifyPostgresqlField(doc,{column:column.path,nativeSource:'{}',mode:'strict'})).toThrow();
 const result=classifyPostgresqlField(doc,{column:column.path,nativeSource,mode:'strict'});result.target!.future='changed';expect(()=>recoverPostgresqlFieldCapture(result,result.target!)).toThrow();
 doc.modules.find(m=>m.id==='postgresql.columns')!.elements[0]!.name='wrong';expect(()=>classifyPostgresqlField(doc,{column:column.path,nativeSource,mode:'strict'})).toThrow();
 const newer=nativeSource.replace('170004','170005'),future=upgradeFieldEnvelope(importPostgresqlCatalogCapture(newer,{id:'newer'})).target;expect(()=>classifyPostgresqlField(future,{column:column.path,nativeSource:newer,mode:'strict'})).toThrow();
});
