import {test,expect} from 'bun:test';
import {importParquetSchema,exportParquetCapture,writeJsonValue,readJsonValue,upgradeFieldEnvelope,upgradeNullabilityEnvelope,upgradeCardinalityEnvelope,validateDocument} from '../../src';
import {classifyParquetCardinality,recoverParquetCardinalityBytes,type ParquetCardinalityRequest} from '../../src/core-ideals/cardinality-parquet';
const prepare=async(path:string)=>{
 const bytes=new Uint8Array(await Bun.file(path).arrayBuffer());
 const source=upgradeCardinalityEnvelope(upgradeNullabilityEnvelope(upgradeFieldEnvelope(importParquetSchema(bytes,{id:path})).target).target).target;
 const request:ParquetCardinalityRequest={index:1,identity:{module:'logical',element:'value'},profile:'present-value-schema',mode:'strict'};
 return {bytes,source,request};
};
test('Parquet logical classification preserves nested Fields, map residuals and exact native bytes',async()=>{
 const native=await Bun.file('fixtures/validation/cardinality-parquet-profile-native.json').json();
 for(const row of native.cases){
  const {bytes,source,request}=await prepare(row.path),before=structuredClone(source);
  for(const mode of ['strict','report'] as const){
   const r=classifyParquetCardinality(source,{...request,mode});
   const map=r.mapping.nodes.some(n=>n.shape==='map');
   expect(r.status).toBe(map&&mode==='strict'?'blocked':'classified');
   expect(r.mapping.cardinality).toBe(row.observations.shape);
   expect(r.mapping.outcome).toBe(map?'approximated':'exact');
   if(!r.target){expect(r).not.toHaveProperty('target');continue;}
   expect(validateDocument(r.target).valid).toBe(true);
   expect(r.target.modules.slice(0,source.modules.length)).toEqual(source.modules);
   const logical=r.target.modules.at(-1)!;
   expect(logical.elements.length).toBe(r.mapping.nodes.length);
   for(const e of logical.elements){
    expect(e.kind).toBe('field');expect(e).not.toHaveProperty('nullability');
    if(e.cardinality==='array'||e.cardinality==='map'){
     expect(e).not.toHaveProperty('scalarType');expect(e.itemType).toBeDefined();
     expect(logical.elements.some(n=>n.id===(e.itemType as {element:string}).element)).toBe(true);
    }
   }
   for(const format of ['json','yaml'] as const){
    const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;
    expect(recoverParquetCardinalityBytes(saved,saved.target!)).toEqual(bytes);
   }
  }
  expect(source).toEqual(before);
 }
},120000);
test('unresolved profiles, wrappers and key-only maps retain residuals rather than invented meaning',async()=>{
 const {bytes,source,request}=await prepare('fixtures/parquet/cardinality/array-nested-1.parquet');
 expect(classifyParquetCardinality(source,{...request,profile:'unresolved'}).status).toBe('blocked');
 const unknown=classifyParquetCardinality(source,{...request,profile:'unresolved',mode:'report'});
 expect(unknown.mapping.nodes).toHaveLength(1);expect(unknown.mapping.cardinality).toBe('unspecified');
 expect(unknown.target!.modules.at(-1)!.elements[0]).not.toHaveProperty('itemType');
 expect(recoverParquetCardinalityBytes(unknown,unknown.target!)).toEqual(bytes);
 const wrapper=classifyParquetCardinality(source,{...request,index:2,mode:'report'});
 expect(wrapper.mapping.cardinality).toBe('unspecified');expect(wrapper.mapping.outcome).toBe('unknown');
 const keyOnly=await prepare('fixtures/parquet/containers/map-key-only.parquet');
 expect(classifyParquetCardinality(keyOnly.source,keyOnly.request).status).toBe('blocked');
 const report=classifyParquetCardinality(keyOnly.source,{...keyOnly.request,mode:'report'});
 expect(report.mapping.cardinality).toBe('unspecified');expect(exportParquetCapture(report.target!)).toEqual(keyOnly.bytes);
});
test('conflicts, forged receipts, stale targets and invalid input refuse without erasing unknown content',async()=>{
 const {source,request}=await prepare('fixtures/parquet/cardinality/array-nested-1.parquet');
 source.vocabularies['example.future']={version:'9.0.0'};source.extensions={'example.future':{opaque:['future',9007199254740991]}};
 const r=classifyParquetCardinality(source,request);expect(r.target!.extensions).toEqual(source.extensions);
 expect(classifyParquetCardinality(r.target!,{...request,mode:'report'}).status).toBe('blocked');
 for(const module of ['parquet','parquet.fields'])expect(classifyParquetCardinality(source,{...request,identity:{module,element:'new'},mode:'report'}).status).toBe('blocked');
 const incompatible=structuredClone(source);incompatible.vocabularies['umf.parquet.cardinality']={version:'2.0.0'};
 expect(classifyParquetCardinality(incompatible,{...request,mode:'report'}).status).toBe('blocked');
 const forged=structuredClone(r);forged.mapping.nodes[0]!.shape='one';expect(()=>recoverParquetCardinalityBytes(forged,r.target!)).toThrow();
 const stale=structuredClone(r.target!);stale.modules.at(-1)!.elements[0]!.name='changed';expect(()=>recoverParquetCardinalityBytes(r,stale)).toThrow();
 for(const index of [0,-1,NaN,1.5,99999])expect(()=>classifyParquetCardinality(source,{...request,index})).toThrow();
 expect(()=>classifyParquetCardinality({...source,umf:'0.3.0'},request)).toThrow();
 const invalid=await prepare('fixtures/parquet/containers/map-repeated-value.parquet');
 expect(()=>classifyParquetCardinality(invalid.source,{...invalid.request,mode:'report'})).toThrow('topology');
});
