import {test,expect} from 'bun:test';
import {selectCoreElements,readDocument,writeDocument,coreSchema,Registry,importTableSpec,importPostgresqlCatalogCapture,importSqlServerCatalog,importAvroSchema,importParquetSchema,exportTableSpec,exportPostgresqlCatalogCapture,exportSqlServerCatalog,exportAvroSchema,exportParquetCapture,type Document,type ExtensionPackage} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/core/element-selection.schema.json';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema);
const mixed:Document={umf:'0.1.0',id:'mixed',vocabularies:{'future.meaning':{version:'1.0.0'}},extensions:{'future.meaning':{unknownDependency:{module:'support',element:'customer'}}},modules:[
 {id:'sales',namespace:'sales',elements:[{id:'customer',name:'Customer',scalarType:'integer',extensions:{'future.meaning':{opaque:'keep'}},references:[{role:'account',module:'billing',element:'account',future:'edge annotation'},{role:'account',module:'billing',element:'account'}]}]},
 {id:'support',namespace:'support',elements:[{id:'customer',name:'Customer',scalarType:'future-scalar',extensions:{}}]},
 {id:'billing',namespace:'billing',elements:[{id:'account',name:'AccountHolder',scalarType:'string',extensions:{},references:[{role:'owner',module:'sales',element:'customer'}]}]}
]};
test('CONTRACT-001 selection preserves distinct contexts, core reference boundaries, cycles and unknown meaning',async()=>{
 const query={references:'none' as const,names:['Customer']},r=selectCoreElements(mixed,query);expect(check(r)).toBe(true);expect(r.selection.map(e=>e.module)).toEqual(['sales','support']);expect(r.boundaryReferences.length).toBe(2);expect(r.boundaryReferences[0]!.reference.future).toBe('edge annotation');expect(r.sourceValidation.complete).toBe(false);expect(r.sourceValidation.diagnostics.some(d=>d.code==='UNKNOWN_SCALAR_TYPE')).toBe(true);expect(r.source).toEqual(mixed);
 const closure=selectCoreElements(mixed,{references:'transitive',identities:[{module:'sales',element:'customer'}]});expect(check(closure)).toBe(true);expect(closure.selection.map(e=>[e.module,e.includedBy])).toEqual([['sales','match'],['billing','reference']]);expect(closure.boundaryReferences).toEqual([]);expect(closure.referenceScope).toBe('explicit-core-references');
 expect(selectCoreElements(mixed,{references:'none',scalarTypes:['future-scalar']}).selection.map(e=>e.module)).toEqual(['support']);expect(selectCoreElements(mixed,{references:'none',namespaces:['support'],names:['Customer']}).selection.length).toBe(1);expect(selectCoreElements(mixed,{references:'none',names:[]}).selection).toEqual([]);
 for(const format of ['json','yaml'] as const)expect(selectCoreElements(readDocument(writeDocument(mixed,format),format),query)).toEqual(r);
 await Bun.write('fixtures/validation/core-selection.json',JSON.stringify({source:mixed,query,result:r,closureQuery:{references:'transitive',identities:[{module:'sales',element:'customer'}]},closure},null,2)+'\n');
 r.selection[0]!.element.name='changed';r.source.modules[0]!.elements[0]!.name='other';r.query.names!.push('new');expect(mixed.modules[0]!.elements[0]!.name).toBe('Customer');expect(query.names).toEqual(['Customer']);expect(r.source.modules[0]!.elements[0]!.name).not.toBe(r.selection[0]!.element.name);
});
test('CONTRACT-001 malformed queries and unresolved core sources fail without invoking accessors',()=>{
 for(const query of [{},{references:'native'},{references:'none',names:null},{references:'none',scalarTypes:['']},{references:'none',identities:[{module:'sales',element:''}]},{references:'none',extra:true}])expect(()=>selectCoreElements(mixed,query as any)).toThrow();
 const bad=structuredClone(mixed);bad.modules[0]!.elements[0]!.references![0]!.element='missing';expect(()=>selectCoreElements(bad,{references:'none'})).toThrow('UNRESOLVED_REFERENCE');
 let invoked=false;const query={references:'none',get names(){invoked=true;return ['Customer'];}};expect(()=>selectCoreElements(mixed,query as any)).toThrow('accessors');expect(invoked).toBe(false);
 const large:Document={umf:'0.1.0',id:'large',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'e',extensions:{},future:Array(51000).fill('opaque')}]}]};expect(()=>selectCoreElements(large,{references:'none'})).toThrow('limit');
});
test('CONTRACT-001 callers can supply semantic validation without confusing selection with native dependency discovery',()=>{
 const manifest:ExtensionPackage={id:'future.meaning',version:'1.0.0',coreVersion:'0.1.0',description:'Synthetic validation probe',schema:{type:'object'},semantics:'Synthetic validator controls acceptance',scopes:['document','element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
 const known=new Registry().register(manifest,()=>[]),r=selectCoreElements(mixed,{references:'none',names:[]},known);expect(r.sourceValidation.diagnostics.some(d=>d.code==='UNKNOWN_EXTENSION')).toBe(false);expect(r.sourceValidation.complete).toBe(false);expect(r.selection).toEqual([]);
 const rejected=new Registry().register(manifest,()=>[{code:'NATIVE_INVALID',path:'',severity:'error',message:'Invalid synthetic semantics'}]);expect(()=>selectCoreElements(mixed,{references:'none',names:[]},rejected)).toThrow('NATIVE_INVALID');
});
test('CONTRACT-001 shared scalar selection keeps native recoveries intact across the five priority systems',async()=>{
 const tablespec=(await Bun.file('fixtures/tablespec/avro-projection.json').json()).cases.find((c:any)=>c.id==='providers');
 const cases:[string,Document,string,(doc:Document)=>unknown][]=[
  ['tablespec',importTableSpec(tablespec.nativeSource,{id:'tablespec',format:tablespec.format}),'provider_id',exportTableSpec],
  ['postgresql',importPostgresqlCatalogCapture(await Bun.file('fixtures/postgresql/catalog-capture.json').text(),{id:'postgresql'}),'ordinary',d=>exportPostgresqlCatalogCapture(d).json],
  ['sqlserver',importSqlServerCatalog(await Bun.file('fixtures/sqlserver/catalog.json').text(),{id:'sqlserver'}),'ordinary',exportSqlServerCatalog],
  ['avro',importAvroSchema('{"type":"record","name":"Example","fields":[{"name":"count","type":"long"}]}',{id:'avro'}),'count',exportAvroSchema],
  ['parquet',importParquetSchema(new Uint8Array(await Bun.file('fixtures/parquet/avro/nested.parquet').arrayBuffer()),{id:'parquet'}),'unsigned',d=>Array.from(exportParquetCapture(d))]
 ];
 const fixtures=[];
 for(const [system,source,name,recover] of cases){const query={references:'none' as const,names:[name],scalarTypes:system==='tablespec'?['string']:['integer']},r=selectCoreElements(source,query);expect(check(r)).toBe(true);expect(r.selection.length).toBe(1);expect(r.selection[0]!.element.name).toBe(name);expect(r.sourceValidation.complete).toBe(false);for(const format of ['json','yaml'] as const)expect(recover(readDocument(writeDocument(r.source,format),format))).toEqual(recover(source));fixtures.push({system,source,query,result:r});}
 await Bun.write('fixtures/validation/core-selection-adapters.json',JSON.stringify({cases:fixtures},null,2)+'\n');
});
