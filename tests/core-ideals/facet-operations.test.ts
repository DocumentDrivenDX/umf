import {test,expect} from 'bun:test';
import * as u from '../../src';
const identity={module:'m',element:'value'};
function source():u.Document{return {umf:'0.5.0',id:'facets',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',kind:'field',scalarType:'integer',facets:{integerWidth:{bits:64,signed:true,future:'retained'}},extensions:{}},{id:'record',kind:'record',extensions:{}},{id:'object',kind:'field',extensions:{}}]}]};}
test('versioned existing author APIs preserve facets and both receipt serializations',()=>{
 const doc=source();
 const kind=u.declareCoreElementKind(doc,identity,'field'),availability=u.declareCoreNullability(doc,identity,'required'),cardinality=u.declareCoreCardinality(doc,identity,{cardinality:'one'});
 expect(kind.version).toBe('4.0.0');expect(availability.version).toBe('3.0.0');expect(cardinality.version).toBe('2.0.0');
 expect(u.inspectCoreElementKind(doc,identity).meaning).toEqual({state:'known',kind:'field'});
 expect(u.inspectCoreNullability(availability.target,identity).meaning).toEqual({state:'known',nullability:'required'});
 expect(u.inspectCoreCardinality(cardinality.target,identity).meaning).toEqual({state:'known',cardinality:'one'});
 for(const [r,verify] of [[kind,u.verifyCoreKindDeclaration],[availability,u.verifyCoreNullabilityDeclaration],[cardinality,u.verifyCoreCardinalityDeclaration]] as const){
  expect(r.target.modules[0]!.elements[0]!.facets).toEqual(doc.modules[0]!.elements[0]!.facets);
  for(const format of ['json','yaml'] as const){const saved=u.readJsonValue(u.writeJsonValue(r,format),format) as any;expect((verify as any)(saved,saved.target)).toEqual(r);}
  const stale=structuredClone(r.target);stale.modules[0]!.elements[0]!.facets={integerWidth:{bits:8,signed:true}};expect(()=> (verify as any)(r,stale)).toThrow();
  const forged=structuredClone(r) as any;forged.version='1.0.0';expect(()=> (verify as any)(forged,r.target)).toThrow();
 }
 for(const kind of ['record','group'] as const)expect(()=>u.declareCoreElementKind(doc,identity,kind)).toThrow();
 for(const cardinality of ['array','map'] as const)expect(()=>u.declareCoreCardinality(doc,identity,{cardinality})).toThrow();
 expect(doc.modules[0]!.elements[0]!.nullability).toBeUndefined();
});
test('record-type v4 respects faceted-value conflicts and preserves unrelated facet metadata',()=>{
 const doc=source(),record=u.declareCoreElementKind(doc,{module:'m',element:'record'},'record'),object=u.declareCoreElementKind(doc,{module:'m',element:'object'},'field');
 const r=u.declareCoreRecordType(object,record);expect(r.version).toBe('4.0.0');expect(r.target.modules[0]!.elements[0]).toEqual(doc.modules[0]!.elements[0]);
 for(const format of ['json','yaml'] as const){const saved=u.readJsonValue(u.writeJsonValue(r,format),format) as unknown as typeof r;expect(u.verifyCoreRecordTypeDeclaration(saved,saved.target)).toEqual(r);}
 const faceted=source();delete faceted.modules[0]!.elements[0]!.scalarType;faceted.modules[0]!.elements[0]!.facets={future:'retained'};
 expect(()=>u.declareCoreRecordType(u.declareCoreElementKind(faceted,identity,'field'),u.declareCoreElementKind(faceted,{module:'m',element:'record'},'record'))).toThrow('faceted value Field');
});
test('older native Cardinality bindings explicitly refuse facet-envelope declarations',async()=>{
 const author=u.declareCoreCardinality(source(),identity,{cardinality:'one'});
 const rows=await Promise.all([
  import('../../scripts/core-ideals/cardinality-tablespec-projection-cases'),import('../../scripts/core-ideals/cardinality-postgresql-projection-cases'),import('../../scripts/core-ideals/cardinality-sqlserver-projection-cases'),import('../../scripts/core-ideals/cardinality-avro-projection-cases'),import('../../scripts/core-ideals/cardinality-parquet-projection-cases'),
 ]);
 const {backend}=await import('../../native/postgresql/runtime');
 for(const mode of ['strict','report'] as const){
  expect(()=>u.projectCardinalityToTableSpec(author,{...rows[0]!.cardinalityTableSpecProjectionCases()[0]!.request,mode})).toThrow('requires a core 0.4.0');
  await expect(u.projectCardinalityToPostgresql(author,{...rows[1]!.postgresqlCardinalityProjectionCases()[0]!.request,mode},backend)).rejects.toThrow('requires a core 0.4.0');
  expect(()=>u.projectCardinalityToSqlServer(author,{...rows[2]!.sqlserverCardinalityProjectionCases()[0]!.request,mode})).toThrow('requires a core 0.4.0');
  expect(()=>u.projectCardinalityToAvro(author,{...rows[3]!.avroCardinalityProjectionCases()[0]!.request,mode})).toThrow('requires a core 0.4.0');
  expect(()=>u.projectCardinalityToParquet(author,{...rows[4]!.parquetCardinalityProjectionCases()[0]!.request,mode})).toThrow('requires a core 0.4.0');
 }
});
